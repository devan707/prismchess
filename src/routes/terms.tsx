import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { TOS_VERSION } from "@/lib/legal";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Prism Chess" },
      {
        name: "description",
        content:
          "The rules for using Prism Chess: account terms, user-generated variants and pieces, acceptable use, and the license you grant when you publish content.",
      },
      { name: "robots", content: "index,follow" },
      { property: "og:title", content: "Terms of Service — Prism Chess" },
      {
        property: "og:description",
        content: "The rules for using Prism Chess and the license you grant when you publish content.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-3xl mx-auto px-4 pt-6">
        <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Link>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8 prose prose-invert prose-sm md:prose-base max-w-none">
        <h1 className="font-display text-3xl md:text-4xl font-bold">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">
          Last updated: {TOS_VERSION} · Version {TOS_VERSION}
        </p>

        <p>
          Welcome to Prism Chess. These Terms of Service (&ldquo;Terms&rdquo;) form a legal
          agreement between you and the operators of Prism Chess (&ldquo;Prism Chess,&rdquo;
          &ldquo;we,&rdquo; &ldquo;us&rdquo;). By creating an account or using the service
          you agree to these Terms and to our{" "}
          <Link to="/privacy" className="underline">Privacy Policy</Link>. If you do not agree, do
          not use Prism Chess.
        </p>

        <nav aria-label="Table of contents" className="rounded-lg border bg-card p-4 not-prose my-6">
          <p className="font-semibold mb-2 text-sm">Contents</p>
          <ol className="list-decimal pl-5 space-y-1 text-sm">
            <li><a href="#accounts" className="underline">Accounts &amp; eligibility</a></li>
            <li><a href="#ugc" className="underline">Your variants, pieces, and other content</a></li>
            <li><a href="#license" className="underline">License you grant Prism Chess</a></li>
            <li><a href="#ownership" className="underline">Ownership of the platform</a></li>
            <li><a href="#acceptable-use" className="underline">Acceptable use</a></li>
            <li><a href="#fair-play" className="underline">Fair play</a></li>
            <li><a href="#termination" className="underline">Suspension &amp; termination</a></li>
            <li><a href="#disclaimers" className="underline">Disclaimers</a></li>
            <li><a href="#liability" className="underline">Limitation of liability</a></li>
            <li><a href="#indemnity" className="underline">Indemnity</a></li>
            <li><a href="#changes" className="underline">Changes to these Terms</a></li>
            <li><a href="#contact" className="underline">Contact</a></li>
          </ol>
        </nav>

        <h2 id="accounts">1. Accounts &amp; eligibility</h2>
        <p>
          You must be at least 13 years old to create an account. When you sign up you
          confirm that you are 13 or older and that all information you provide is accurate.
          You are responsible for any activity that happens on your account, including
          keeping your password and any third-party sign-in (such as Google) secure. One
          account per human; bots and automated accounts are not permitted unless we
          authorize them in writing.
        </p>

        <h2 id="ugc">2. Your variants, pieces, and other content</h2>
        <p>
          Prism Chess lets you design and publish chess variants, custom pieces, forum
          posts, comments, messages, profile information, avatars, and other contributions
          (collectively, &ldquo;User Content&rdquo;). You are solely responsible for the User
          Content you publish and for ensuring you have the rights to publish it. Do not
          upload anything that infringes someone else&rsquo;s intellectual property, privacy,
          or other rights.
        </p>

        <h2 id="license">3. License you grant Prism Chess</h2>
        <p>
          By submitting or publishing User Content on Prism Chess you grant us a{" "}
          <strong>perpetual, irrevocable, worldwide, non-exclusive, royalty-free,
          sublicensable and transferable license</strong> to host, store, reproduce,
          display, perform, distribute, modify, adapt, translate, create derivative works
          from, and otherwise use that User Content in connection with operating, promoting,
          and improving Prism Chess and any successor service, in any medium now known or
          later developed.
        </p>
        <p>
          This license specifically allows Prism Chess to feature your variants and pieces
          on the home screen, in the &ldquo;signature&rdquo; catalog, in marketing, in
          tutorials, and in derivative variants we publish ourselves. <strong>You will not
          be entitled to any royalties, attribution payments, or other compensation for any
          use of your User Content.</strong> Attribution is at our discretion.
        </p>
        <p>
          You retain authorship of your User Content. You may keep using it elsewhere. If
          you delete a piece of User Content, we will stop displaying it on Prism Chess
          within a reasonable time, but copies may remain in backups, analytics, and in
          derivative variants or games that other users have already played, saved, or
          continued. Variants and pieces you have published may remain available to other
          players even after you delete your account.
        </p>
        <p>
          You agree not to claim that Prism Chess, or any user who plays or copies a
          variant published on Prism Chess, owes you royalties, license fees, or other
          payment in connection with that variant.
        </p>

        <h2 id="ownership">4. Ownership of the platform</h2>
        <p>
          Prism Chess, including the software, branding, the &ldquo;Prism Chess&rdquo; name,
          logos, the curated catalog of signature variants and pieces, the matchmaking and
          rating systems, and all related materials, is and remains our property. Nothing
          in these Terms transfers any of that to you. You may not copy, redistribute, or
          create derivative works of the platform itself except as expressly allowed.
        </p>

        <h2 id="acceptable-use">5. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Harass, threaten, dox, or impersonate anyone.</li>
          <li>Post hateful content, slurs, sexual content involving minors, or content that promotes self-harm or violence.</li>
          <li>Upload usernames, display names, avatars, pieces, or variant names that are offensive, infringing, or misleading.</li>
          <li>Spam, send unsolicited promotions, or use the messaging features for mass outreach.</li>
          <li>Scrape, crawl, or use the service in a way that places an unreasonable load on it.</li>
          <li>Reverse-engineer, decompile, or attempt to extract source code or model weights from the service, except to the extent applicable law allows.</li>
          <li>Probe, scan, or attempt to bypass authentication, rate-limiting, or other security controls.</li>
          <li>Use Prism Chess to violate any law or another person&rsquo;s rights.</li>
        </ul>

        <h2 id="fair-play">6. Fair play</h2>
        <p>
          Don&rsquo;t cheat. That includes using an engine or another person to choose your
          moves in rated or friendly games, sandbagging your rating, opening multiple
          accounts to manipulate matchmaking, exploiting bugs in the rules engine, or
          abusing the report or moderation systems. Detected violations can result in
          forfeited games, rating adjustments, suspension, or account termination.
        </p>

        <h2 id="termination">7. Suspension &amp; termination</h2>
        <p>
          We may suspend or terminate your account, remove User Content, or restrict
          access to features at any time if we believe you have violated these Terms or if
          we need to protect Prism Chess or its users. You may stop using Prism Chess and
          delete your account at any time. Sections that by their nature should survive
          termination (such as the license you grant, ownership, disclaimers, limitation
          of liability, and indemnity) will survive.
        </p>

        <h2 id="disclaimers">8. Disclaimers</h2>
        <p>
          Prism Chess is provided <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>
          without warranties of any kind, whether express or implied, including any implied
          warranties of merchantability, fitness for a particular purpose, non-infringement,
          or that the service will be uninterrupted, secure, or error-free. We do not
          warrant the accuracy of ratings, matchmaking, AI move suggestions, or any other
          algorithmic output. Use of the service is at your own risk.
        </p>

        <h2 id="liability">9. Limitation of liability</h2>
        <p>
          To the maximum extent allowed by law, Prism Chess and its operators will not be
          liable for any indirect, incidental, special, consequential, exemplary, or
          punitive damages, or for any loss of profits, revenue, data, goodwill, or other
          intangible losses, arising out of or related to your use of the service. Our
          total aggregate liability to you for any claim arising out of or relating to the
          service or these Terms will not exceed the greater of (a) the amount you have
          paid us in the twelve months before the event giving rise to the claim, or
          (b) US$50.
        </p>

        <h2 id="indemnity">10. Indemnity</h2>
        <p>
          You agree to defend, indemnify, and hold harmless Prism Chess, its operators,
          and their respective officers, employees, and agents from any claim, demand,
          loss, or damages, including reasonable legal fees, arising out of or related to
          your User Content, your use of the service, or your violation of these Terms.
        </p>

        <h2 id="changes">11. Changes to these Terms</h2>
        <p>
          We may update these Terms from time to time. When we make a material change we
          will update the &ldquo;Last updated&rdquo; date and the version number above, and
          we may ask you to re-accept the Terms inside the app. Continuing to use Prism
          Chess after a change means you accept the updated Terms.
        </p>

        <h2 id="contact">12. Contact</h2>
        <p>
          For questions about these Terms or to report a violation, please reach out
          through the in-app help screen or contact the project owner. Governing law and
          jurisdiction will be specified once the operator has filled them in.
        </p>

        <hr className="my-8" />
        <p className="text-xs text-muted-foreground">
          See also our <Link to="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </main>
    </div>
  );
}
