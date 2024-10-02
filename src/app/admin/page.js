import { supabase } from '../utils.js';

export default async function Admin() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return `
      <script>
        window.location.href = '/login';
      </script>
    `;
  }

  // Fetch existing URLs
  const { data: urls, error: fetchError } = await supabase
    .from('urls')
    .select('*');

  if (fetchError) {
    console.error('Error fetching URLs:', fetchError);
    return `<div>Error fetching URLs</div>`;
  }

  return `
    <div>
      <h1>Admin Dashboard</h1>
      <p>Welcome, ${user.email}!</p>

      <h2>Add URL</h2>
      <form id="urlForm">
        <input type="text" id="url" placeholder="Enter URL" required />
        <input type="text" id="description" placeholder="Enter description" required />
        <button type="submit">Add URL</button>
      </form>

      <h2>Existing URLs</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>URL</th>
            <th>Description</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${urls.map(url => `
            <tr>
              <td>${url.id}</td>
              <td><a href="${url.url}" target="_blank">${url.url}</a></td>
              <td>${url.description}</td>
              <td>
                <button onclick="deleteUrl(${url.id})">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <script>
        document.getElementById('urlForm').onsubmit = async function(event) {
          event.preventDefault();
          const url = document.getElementById('url').value;
          const description = document.getElementById('description').value;

          const { error } = await supabase
            .from('urls')
            .insert([{ url, description }]);

          if (error) {
            alert('Error adding URL: ' + error.message);
          } else {
            window.location.reload();
          }
        };

        async function deleteUrl(id) {
          const { error } = await supabase
            .from('urls')
            .delete()
            .match({ id });

          if (error) {
            alert('Error deleting URL: ' + error.message);
          } else {
            window.location.reload();
          }
        }
      </script>
    </div>
  `;
}
