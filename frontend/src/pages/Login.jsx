import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' }); // ✅ Change email to username
  const [message, setMessage] = useState('');
  const navigate = useNavigate();



  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage('✅ Logged in!');
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username); // ✅ Save username for navbar
        navigate('/');
      } else {
        setMessage(`❌ ${data.message}`);
      }
    } catch (err) {
      setMessage('❌ Server error');
    }
  };

  return (
    <div className="container text-white" style={{ paddingTop: '100px' }}>
      <h2>Login</h2>
      {message && <p>{message}</p>}
      <form onSubmit={handleSubmit}>
        <input
          name="username" // ✅ Changed from email to username
          value={form.username}
          onChange={handleChange}
          placeholder="Username"
          type="text"
          required
        />
        <input
          name="password"
          value={form.password}
          onChange={handleChange}
          placeholder="Password"
          type="password"
          required
        />
        <button type="submit" className="btn btn-f1 mt-3">Login</button>
      </form>
      <p className="mt-3">
        Don't have an account?{' '}
        <Link to="/register" className="text-warning">Register here</Link>
      </p>
    </div>
  );
}
