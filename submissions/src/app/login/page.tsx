import { devSignIn, signInWithGoogle } from "@/app/actions";
import { DEV_LOGIN_ENABLED } from "@/lib/auth";

const MESSAGES: Record<string, string> = {
  domain: "That is not a UCI account. Sign in with your @uci.edu address.",
  "not-on-roster":
    "Your UCInetID is not on this year's OPS roster. If you think it should be, ask an officer to add you.",
  disabled: "This account has been disabled. Contact an OPS officer.",
  "no-email": "Google did not share an email address with us, so we cannot identify you.",
  CredentialsSignin: "No roster entry matched that UCInetID.",
  Configuration:
    "Sign-in is not configured yet. Check AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, and AUTH_SECRET in .env.local.",
};

/**
 * Without this check the Google button still renders, sends an empty client_id,
 * and the user lands on Google's "Error 400: invalid_request / Missing required
 * parameter: client_id" page -- which says nothing about the actual cause being
 * an unfilled env var in this repo.
 */
const GOOGLE_CONFIGURED = Boolean(
  process.env.AUTH_GOOGLE_ID?.trim() && process.env.AUTH_GOOGLE_SECRET?.trim(),
);

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? (MESSAGES[error] ?? "Sign-in failed. Try again.") : null;

  return (
    <main className="center">
      <div className="login">
        <h1>OPS Submissions</h1>
        <p className="sub">Sign in with your UCI account to submit your project work.</p>

        {message ? <div className="error">{message}</div> : null}

        <div className="card">
          {GOOGLE_CONFIGURED ? (
            <>
              <form action={signInWithGoogle}>
                <button className="btn" style={{ width: "100%", justifyContent: "center" }}>
                  Continue with UCI Google
                </button>
              </form>
              <p className="sub" style={{ margin: "12px 0 0", fontSize: 13 }}>
                Only <strong>@uci.edu</strong> accounts on the OPS roster can sign in. There is no
                separate password to create or remember.
              </p>
            </>
          ) : (
            <div className="notice">
              <strong>Google sign-in is not configured.</strong>
              <p style={{ margin: "8px 0 0" }}>
                <code>AUTH_GOOGLE_ID</code> and <code>AUTH_GOOGLE_SECRET</code> are empty in{" "}
                <code>submissions/.env.local</code>. Create an OAuth client (Web application) in
                Google Cloud with redirect URI{" "}
                <code>http://localhost:3000/api/auth/callback/google</code>, paste both values in,
                and restart the dev server.
              </p>
            </div>
          )}

          {DEV_LOGIN_ENABLED ? (
            <div className="dev">
              <p className="sub" style={{ margin: "0 0 8px", fontSize: 13 }}>
                <strong>Dev only:</strong> sign in as any roster UCInetID to check a role&apos;s view.
              </p>
              <form action={devSignIn}>
                <input name="ucinetid" placeholder="e.g. astudent1" autoComplete="off" />
                <button className="btn ghost" style={{ width: "100%", justifyContent: "center" }}>
                  Sign in as this user
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
