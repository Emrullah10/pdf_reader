import express from 'express';

export const jsonBody = () => express.json({ limit: '1mb' });

export const notFound = () => (req, res) => {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.path}`, details: null } });
};
