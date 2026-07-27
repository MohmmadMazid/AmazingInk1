import { useState } from 'react';
import { Box, Button, Card, CardContent, TextField, Typography, Alert } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';

export default function LoginScreen() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@mccms.test');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try { await login(email, password); navigate('/products'); }
    catch (err) { setError(err.response?.data?.error?.message ?? 'Login failed'); }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'grey.100' }}>
      <Card sx={{ width: 360 }}>
        <CardContent component="form" onSubmit={submit}>
          <Typography variant="h5" fontWeight={800} gutterBottom>Sign in</Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField fullWidth label="Email" value={email} onChange={(e) => setEmail(e.target.value)} margin="normal" />
          <TextField fullWidth label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} margin="normal" />
          <Button type="submit" fullWidth variant="contained" sx={{ mt: 2 }}>Sign in</Button>
        </CardContent>
      </Card>
    </Box>
  );
}
