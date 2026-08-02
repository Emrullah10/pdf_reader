import dotenv from 'dotenv';

export const loadEnv = () => {
  dotenv.config();
};

export const requireEnv = (key, fallback) => {
  const value = process.env[key];
  if (value !== undefined && value !== '') {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Missing required environment variable: ${key}`);
};
