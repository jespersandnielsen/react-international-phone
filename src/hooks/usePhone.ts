import React, { useEffect, useMemo } from 'react';

import { CountryGuessResult, CountryIso2, RequiredType } from '../types';
import {
  formatPhone,
  getCountry,
  guessCountryByPartialNumber,
  removeNonDigits,
} from '../utils';
import { useHistoryState } from './useHistoryState';
import { usePrevious } from './usePrevious';
import { useTimer } from './useTimer';

interface FormatPhoneValueFuncOptions {
  trimNonDigitsEnd?: boolean;
  insertDialCodeOnEmpty?: boolean;
}

export interface UsePhoneConfig {
  prefix?: string;
  defaultMask?: string;
  maskChar?: string;
  insertSpaceAfterDialCode?: boolean;
  historySaveDebounceMS?: number;
  disableCountryGuess?: boolean;
  disableDialCodePrefill?: boolean;
  forceDialCode?: boolean;
  /**
   * @description
   * Phone value will not include passed *dialCode* and *prefix* if set to *true*.
   * @ignore
   * - *disableCountryGuess* value will be ignored and set to *true*.
   * - *forceDialCode* value will be ignored and set to *false*.
   */
  disableDialCodeAndPrefix?: boolean;
  country?: CountryIso2;
  inputRef?: React.RefObject<HTMLInputElement>;
  onCountryGuess?: (data: RequiredType<CountryGuessResult>) => void;
}

// On change: make sure to update these values in stories
const defaultPhoneConfig: Required<
  Omit<UsePhoneConfig, 'inputRef' | 'country' | 'onCountryGuess'> // omit props with no default value
> = {
  prefix: '+',
  defaultMask: '............', // 12 chars
  maskChar: '.',
  insertSpaceAfterDialCode: true,
  historySaveDebounceMS: 200,
  disableCountryGuess: false,
  disableDialCodePrefill: false,
  forceDialCode: false,
  disableDialCodeAndPrefix: false,
};

export const usePhone = (value: string, config?: UsePhoneConfig) => {
  const {
    country,
    prefix,
    defaultMask,
    maskChar,
    insertSpaceAfterDialCode,
    historySaveDebounceMS,
    disableCountryGuess,
    disableDialCodePrefill,
    forceDialCode,
    disableDialCodeAndPrefix,
    inputRef,
    onCountryGuess,
  } = {
    ...defaultPhoneConfig,
    ...config,
  };
  const charAfterDialCode = insertSpaceAfterDialCode ? ' ' : '';
  const shouldGuessCountry = disableDialCodeAndPrefix
    ? false
    : !disableCountryGuess;

  const timer = useTimer();

  const passedCountry = useMemo(() => {
    if (!country) return;
    return getCountry(country, 'iso2');
  }, [country]);

  const prevPassedCountry = usePrevious(passedCountry);

  const formatPhoneValue = (
    value: string,
    { trimNonDigitsEnd, insertDialCodeOnEmpty }: FormatPhoneValueFuncOptions,
  ): { phone: string; countryGuessResult?: CountryGuessResult | undefined } => {
    const countryGuessResult = shouldGuessCountry
      ? guessCountryByPartialNumber(value) // FIXME: should not guess country on every change
      : undefined;

    const formatCountry = shouldGuessCountry
      ? countryGuessResult?.country ?? passedCountry
      : passedCountry;

    const phone = formatCountry
      ? formatPhone(value, {
          prefix,
          mask: formatCountry?.format ?? defaultMask,
          maskChar,
          dialCode: formatCountry?.dialCode,
          trimNonDigitsEnd,
          charAfterDialCode,
          forceDialCode,
          insertDialCodeOnEmpty,
          disableDialCodeAndPrefix,
        })
      : value;

    return { phone, countryGuessResult };
  };

  const [phone, setPhone, undo, redo] = useHistoryState('');

  // set initial phone value
  useEffect(() => {
    setPhone(
      formatPhoneValue(value, {
        trimNonDigitsEnd: false,
        insertDialCodeOnEmpty: !disableDialCodePrefill,
      }).phone,
      {
        overrideLastHistoryItem: true,
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rawPhone = useMemo(() => {
    return removeNonDigits(phone);
  }, [phone]);

  // Handle undo/redo events
  useEffect(() => {
    const input = inputRef?.current;
    if (!input) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const ctrlPressed = e.ctrlKey;
      const shiftPressed = e.shiftKey;
      const zPressed = e.key.toLowerCase() === 'z';

      if (!ctrlPressed || !zPressed) return;
      return shiftPressed ? redo() : undo();
    };

    input?.addEventListener('keydown', onKeyDown);
    return () => {
      input?.removeEventListener('keydown', onKeyDown);
    };
  }, [inputRef, undo, redo]);

  // on country change
  useEffect(() => {
    if (!passedCountry || !prevPassedCountry) return; // initial render

    if (
      guessCountryByPartialNumber(rawPhone).country?.dialCode !==
      passedCountry.dialCode
    ) {
      // country was updated with country-selector (not from input)
      const phoneValue = disableDialCodeAndPrefix
        ? ''
        : `${prefix}${passedCountry.dialCode}${charAfterDialCode}`;
      return setPhone(phoneValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  const handlePhoneValueChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ): string => {
    e.preventDefault();

    // Didn't find out how to properly type it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputType: string = (e.nativeEvent as any).inputType;
    const isDeletion = inputType.toLocaleLowerCase().includes('delete');

    const value = e.target.value;

    const { phone, countryGuessResult } = formatPhoneValue(value, {
      trimNonDigitsEnd: isDeletion, // trim values if user deleting chars (delete mask's whitespace and brackets)
      insertDialCodeOnEmpty: false,
    });

    const historySaveDebounceTimePassed =
      (timer.check() ?? -1) < historySaveDebounceMS;

    setPhone(phone, { overrideLastHistoryItem: historySaveDebounceTimePassed });

    if (
      shouldGuessCountry &&
      countryGuessResult?.country &&
      countryGuessResult.country.name !== country
    ) {
      onCountryGuess?.(countryGuessResult as RequiredType<CountryGuessResult>);
    }

    return phone;
  };

  return {
    phone,
    rawPhone,
    handlePhoneValueChange,
  };
};
