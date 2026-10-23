import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, firebaseConfigured } from '../firebase.js';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent } from '@/components/ui/card.jsx';
import MyInput from '@/components/custom/myInput.jsx';

const emailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;

function LoginPage() {
  const [loginState, setLoginState] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');

  async function handleLogin(event) {
    event.preventDefault();
    setError('');

    try {
      await signInWithEmailAndPassword(
        auth,
        loginState.email.trim(),
        loginState.password,
      );
    } catch (loginError) {
      setError(loginError.message || 'Unable to sign in.');
    }
  }

  return (
    <div className="auth-shell">
      {!firebaseConfigured ? (
        <Card className="warning-card">
          <CardContent>Firebase is not configured.</CardContent>
        </Card>
      ) : null}

      <Card className="auth-card">
        <div className="brand-row">
          <div className="brand-pill">SI</div>
          <div className="brand-text">
            <p className="eyebrow">Savage Innovations</p>
            <h2>Inventory Control</h2>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleLogin}>
          <MyInput
            id="email"
            type="email"
            label="Email"
            placeholder="user@example.com"
            autoComplete="email"
            required
            value={loginState.email}
            error={emailError}
            onChange={(email) =>
              setLoginState((current) => ({
                ...current,
                email,
              }))
            }
            onBlur={() => {
              const email = loginState.email.trim();
              setEmailError(
                email && !emailRegex.test(email)
                  ? 'Enter a valid email address.'
                  : '',
              );
            }}
          />
          <MyInput
            id="password"
            type="password"
            label="Password"
            placeholder="Password"
            autoComplete="current-password"
            required
            value={loginState.password}
            onChange={(password) => setLoginState((current) => ({
                ...current,
                password,
            }))}
          />
          <Button
            type="submit"
            className="primary-button"
            disabled={!firebaseConfigured}
          >
            Sign in
          </Button>
        </form>

        <div className="demo-box">
          <strong>Account access</strong>
          <div>
            Accounts are provisioned by an administrator. Contact your
            administrator if you need access.
          </div>
        </div>

        {error ? <p className="error-text" role="alert">{error}</p> : null}
      </Card>
    </div>
  );
}

export default LoginPage;
