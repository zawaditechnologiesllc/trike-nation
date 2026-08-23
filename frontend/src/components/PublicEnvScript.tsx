import { publicEnv } from "@/lib/env";

/**
 * Injects the public environment into the document on every server render, so
 * the browser gets live values even when the build had none. Rendered in the
 * root layout, before any client component runs.
 *
 * Only PUBLIC_ENV_KEYS are serialised — this is inline script content, so
 * anything placed here is public by definition.
 */
export default function PublicEnvScript() {
  const env = publicEnv();
  return (
    <script
      // Serialised with JSON.stringify twice: the inner value becomes a string
      // literal, so a "</script>" inside a value cannot close this tag.
      dangerouslySetInnerHTML={{
        __html: `window.__APP_ENV=JSON.parse(${JSON.stringify(JSON.stringify(env))});`,
      }}
    />
  );
}
