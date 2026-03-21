import { register, login } from '../api';

export function renderAuth(
  container: HTMLElement,
  onSuccess: () => void
): void {
  container.innerHTML = `
    <div class="screen auth-screen">
      <h1 class="logo">OARENA</h1>
      <p class="tagline">Real-time erg racing</p>
      <form id="auth-form">
        <input type="text" id="auth-username" placeholder="Username" autocomplete="username" required minlength="3" maxlength="20" />
        <input type="password" id="auth-password" placeholder="Password" autocomplete="current-password" required minlength="6" />
        <button type="submit" id="auth-submit" class="btn-primary">Login</button>
        <button type="button" id="auth-toggle" class="btn-secondary">Need an account? Register</button>
      </form>
      <p id="auth-error" class="error"></p>
    </div>
  `;

  let isRegister = false;
  const form = container.querySelector('#auth-form') as HTMLFormElement;
  const submitBtn = container.querySelector('#auth-submit') as HTMLButtonElement;
  const toggleBtn = container.querySelector('#auth-toggle') as HTMLButtonElement;
  const errorEl = container.querySelector('#auth-error') as HTMLElement;

  toggleBtn.addEventListener('click', () => {
    isRegister = !isRegister;
    submitBtn.textContent = isRegister ? 'Register' : 'Login';
    toggleBtn.textContent = isRegister
      ? 'Already have an account? Login'
      : 'Need an account? Register';
    errorEl.textContent = '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    submitBtn.disabled = true;

    const username = (container.querySelector('#auth-username') as HTMLInputElement).value;
    const password = (container.querySelector('#auth-password') as HTMLInputElement).value;

    try {
      if (isRegister) {
        await register(username, password);
      } else {
        await login(username, password);
      }
      onSuccess();
    } catch (err: any) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });
}
