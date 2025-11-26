import { Link } from 'react-router-dom';

export default function ThankYou() {
  return (
    <div className="text-center text-white" style={{ paddingTop: '80px' }}>
      <h2>✅ Thanks for submitting your predictions!</h2>
      <p>You can now return to the homepage.</p>
      <Link to="/" className="btn btn-f1 mt-4">Back to Home</Link>
    </div>
  );
}
