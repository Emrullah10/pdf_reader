import { api } from '@shared/axios/axios-instance';

export const registerRequest = ({ email, password, name }) =>
  api.post('/gateway/register', { email, password, name }).then((res) => res.data);

export const loginRequest = ({ email, password }) =>
  api.post('/gateway/login', { email, password }).then((res) => res.data);

export const logoutRequest = () => api.post('/gateway/logout').then((res) => res.data);

export const meRequest = () => api.get('/gateway/me').then((res) => res.data);
