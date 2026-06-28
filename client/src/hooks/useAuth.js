import { useAuthContext } from '../contexts/AuthContext.jsx';

export default function useAuth() {
  return useAuthContext();
}
