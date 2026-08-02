import { useMutation, useQueryClient } from '@tanstack/react-query';
import { loginRequest, logoutRequest, registerRequest } from '@api/auth';
import { useAuthStore } from '@store/useAuthStore';

export const useLogin = () => {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: loginRequest,
    onSuccess: (data) => {
      setUser(data.user);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
};

export const useRegister = () => {
  return useMutation({ mutationFn: registerRequest });
};

export const useLogout = () => {
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logoutRequest,
    onSuccess: () => {
      clear();
      queryClient.clear();
    },
  });
};
