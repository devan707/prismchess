import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PRIVACY_VERSION } from "@/lib/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Prism Chess" },
      {
        name: "description",
        content:
          "How Prism Chess collects, uses, and protects your data, including gameplay history, profile information, and push notification tokens.",
      },
      { name: "robots", content: "index,follow" },
      { property: "og:title", content: "Privacy Policy — Prism Chess" },
      {
        property: "og:description",
        content: "How Prism Chess collects, uses, and protects your data.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-3xl mx-auto px-4 pt-6">
        <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Link>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8 prose prose-invert prose-sm md:prose-base max-w-none">
        <h1 className="font-display text-3xl md:text-4xl font-bold">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">
          Last updated: {PRIVACY_VERSION} · Version {PRIVACY_VERSION}
        </p>

        <p>
          This Privacy Policy explains what information Prism Chess collects, how we use
          it, who we share it with, and the choices you have. It applies to your use of
          the Prism Chess website and apps.
        </p>

        <nav aria-label="Table of contents" className="rounded-lg border bg-card p-4 not-prose my-6">
          <p className="font-semibold mb-2 text-sm">Contents</p>
          <ol className="list-decimal pl-5 space-y-1 text-sm">
            <li><a href="#collect" className="underline">Information we collect</a></li>
            <li><a href="#use" className="underline">How we use it</a></li>
            <li><a href="#share" className="underline">Sharing &amp; service providers</a></li>
            <li><a href="#choices" className="underline">Your choices</a></li>
            <li><a href="#retention" className="underline">Retention &amp; deletion</a></li>
            <li><a href="#children" className="underline">Children</a></li>
            <li><a href="#security" className="underline">Security</a></li>
            <li><a href="#changes" className="underline">Changes</a></li>
            <li><a href="#contact" className="underline">Contact</a></li>
          </ol>
        </nav>

        <h2 id="collect">1. Information we collect</h2>
        <p>We collect only what we need to run the service:</p>
        <ul>
          <li>
            <strong>Account information:</strong> your email address and a hashed password
            (or, if you sign in with Google, an identifier and basic profile data returned
            by Google such as your name and profile picture).
          </li>
          <li>
            <strong>Profile:</strong> the username, display name, avatar (uploaded photo or
            chosen symbol), and preferences you set during onboarding or in your profile.
          </li>
          <li>
            <strong>Gameplay data:</strong> the variants you create, your published pieces,
            forum posts and comments, friendships, direct messages, matches, moves,
            ratings, and other activity that makes the service work.
          </li>
          <li>
            <strong>Notification tokens:</strong> if you enable browser push notifications,
            the push subscription returned by your browser, plus a short summary of the
            device or browser so we can remove dead subscriptions.
          </li>
          <li>
            <strong>Technical data:</strong> IP address, user agent, language, and basic
            request logs used for security, abuse prevention, and debugging.
          </li>
          <li>
            <strong>Consents:</strong> the version of the Terms and Privacy Policy you
            accepted, the timestamp, your age confirmation, and your marketing,
            community, and gameplay notification opt-in choices.
          </li>
        </ul>

        <h2 id="use">2. How we use it</h2>
        <ul>
          <li>To run the core gameplay and community features.</li>
          <li>To authenticate you and keep your account secure.</li>
          <li>To send gameplay-related notifications (your move, challenge accepted, new
              direct message, friend request) when you have opted in and granted browser
              permission.</li>
          <li>To send you product updates about Prism Chess if you opted in.</li>
          <li>To send periodic community updates (forum highlights, popular variants) if
              you opted in. We don&rsquo;t commit to a fixed schedule.</li>
          <li>To detect, investigate, and prevent fraud, cheating, and abuse.</li>
          <li>To comply with legal obligations and enforce our Terms.</li>
        </ul>
        <p>
          We don&rsquo;t sell your personal information, and we don&rsquo;t use it for
          third-party advertising.
        </p>

        <h2 id="share">3. Sharing &amp; service providers</h2>
        <p>
          We share data only with vendors we need to operate the service, and only for
          that purpose:
        </p>
        <ul>
          <li>
            <strong>Hosting and database:</strong> Lovable Cloud (which uses Supabase for
            authentication, database, storage, and realtime).
          </li>
          <li>
            <strong>Identity providers:</strong> Google, only when you choose to sign in
            with Google.
          </li>
          <li>
            <strong>Push notifications:</strong> the push services built into your browser
            (such as Mozilla, Apple, and Google&rsquo;s push gateways) when you enable push.
          </li>
          <li>
            <strong>Email delivery:</strong> the email provider used to send transactional
            and (if you opted in) product/community emails.
          </li>
        </ul>
        <p>
          We may disclose information if we believe in good faith that it is required by
          law, or to protect the rights, property, or safety of Prism Chess, our users, or
          others. If we are ever acquired or merge with another company, account data may
          be transferred as part of that transaction, subject to this Privacy Policy.
        </p>

        <h2 id="choices">4. Your choices</h2>
        <ul>
          <li>You can change your marketing, community, and gameplay notification
              opt-ins at any time in your profile settings.</li>
          <li>You can turn browser push notifications on or off at any time.</li>
          <li>You can edit or remove your profile information, including your avatar.</li>
          <li>You can delete published variants, pieces, forum posts, and comments,
              subject to the survival rules in the Terms.</li>
          <li>You can request account deletion (see below).</li>
        </ul>

        <h2 id="retention" >5. Retention &amp; deletion</h2>
        <p>
          We keep account data for as long as your account is active and as long as we
          reasonably need it for the purposes described above. When you delete your
          account we delete or de-identify your profile within a reasonable time. Some
          User Content you have published (variants, pieces, forum posts you contributed
          to) may remain on the service in a de-identified form so games and discussions
          others have built on top of it keep working. Backups and security logs may
          persist for a limited period.
        </p>

        <h2 id="children">6. Children</h2>
        <p>
          Prism Chess is not directed to children under 13 and we do not knowingly collect
          personal information from anyone under 13. If you believe a child under 13 has
          created an account, please contact us so we can remove it.
        </p>

        <h2 id="security">7. Security</h2>
        <p>
          We use industry-standard measures to protect your data, including encryption in
          transit, scoped access controls, and row-level security on our database. No
          online service can be perfectly secure; you are responsible for keeping your
          account credentials safe.
        </p>

        <h2 id="changes">8. Changes</h2>
        <p>
          We may update this Privacy Policy from time to time. When we make a material
          change we will update the &ldquo;Last updated&rdquo; date and the version number
          above and may ask you to re-accept inside the app.
        </p>

        <h2 id="contact">9. Contact</h2>
        <p>
          For privacy questions, data requests, or account deletion, contact us through
          the in-app help screen or the project owner.
        </p>

        <hr className="my-8" />
        <p className="text-xs text-muted-foreground">
          See also our <Link to="/terms" className="underline">Terms of Service</Link>.
        </p>
      </main>
    </div>
  );
}
