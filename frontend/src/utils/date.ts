import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const TIME_ZONE = 'Asia/Kolkata';

export const formatDate = (date: Date | string | number): string => {
  const zonedDate = toZonedTime(date, TIME_ZONE);
  return format(zonedDate, 'dd-MM-yyyy');
};

export const formatDateTime = (date: Date | string | number): string => {
  const zonedDate = toZonedTime(date, TIME_ZONE);
  return format(zonedDate, 'dd-MM-yyyy HH:mm:ss');
};

export const formatTime = (date: Date | string | number): string => {
    const zonedDate = toZonedTime(date, TIME_ZONE);
    return format(zonedDate, 'HH:mm:ss');
};

export const formatYearMonth = (date: Date | string | number): string => {
  const zonedDate = toZonedTime(date, TIME_ZONE);
  return format(zonedDate, 'yyyy-MM');
};

export const toIST = (date: Date | string | number): Date => {
  return toZonedTime(date, TIME_ZONE);
};
