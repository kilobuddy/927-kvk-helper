import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const error = resolvedSearchParams?.error;

  return (
    <main className="app-shell">
      <section className="page-header">
        <p className="eyebrow">Sign In</p>
        <h1>KvK Prep Helper</h1>
        <p className="muted">
          This full-stack version is intended for owner-created accounts. Only invited users can sign in.
        </p>
      </section>

      <section className="card" style={{ maxWidth: 520 }}>
        {error === "invalid" ? (
          <div className="notice warning" style={{ marginBottom: 16 }}>
            Invalid username or password.
          </div>
        ) : null}
        {error === "missing" ? (
          <div className="notice warning" style={{ marginBottom: 16 }}>
            Username and password are required.
          </div>
        ) : null}
        <form action={loginAction} className="form-grid">
          <label>
            Username
            <input type="text" name="username" required />
          </label>
          <label>
            Password
            <input type="password" name="password" required />
          </label>
          <button className="button" type="submit">
            Sign In
          </button>
        </form>
      </section>
    </main>
  );
}
