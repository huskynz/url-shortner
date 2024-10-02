import { supabase } from '../utils'; // Ensure the path is correct

export default async function Login() {
  // Fetch the user session
  const { data: { session } } = await supabase.auth.getSession() || { data: { session: null } };

  if (session) {
    // Redirect to admin page if the user is already logged in
    return `
      <script>
        window.location.href = '/admin';
      </script>
    `;
  }

  // Handle the login when the button is clicked
  return `
    <div>
      <h1>Login</h1>
      <button id="github-login-button">Login with GitHub</button>
      <script>
        document.getElementById('github-login-button').onclick = async function() {
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'github',
          });

          if (error) {
            alert('Error logging in: ' + error.message);
          } else {
            // Redirect after successful login
            window.location.href = '/admin';
          }
        };
      </script>
    </div>
  `;
}
