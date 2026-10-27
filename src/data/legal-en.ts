/**
 * English privacy + terms copy for the legal pages.
 *
 * Facts mirror the code; each figure carries a comment naming the
 * canopy-web constant it must stay consistent with. The `{email}` token is
 * replaced at render time with `founderEmail` — the address is never typed
 * here. No template mark placeholders remain.
 */
import type { LegalDoc } from './legal';

export const privacyEn: LegalDoc = {
  title: 'Privacy Policy — UniverLab services',
  description:
    'What UniverLab records across univerlab.org, graphs, remote and the canopy CLI: the data, the purpose, how long it lasts, and your rights.',
  kicker: 'Legal',
  heading: 'Privacy Policy',
  intro:
    'UniverLab runs public services from Colombia: this site and its announcements feed, the graphs catalogue at graphs.univerlab.org, the remote relay at remote.univerlab.org, and the canopy CLI and daemon. This page says what each one records, why, how long it keeps it, and the rights you have. Short version: the site asks nothing of you, the catalogue reads only public GitHub data, the relay keeps a 12-hour session cookie and nothing else.',
  updatedLabel: 'Last updated',
  effectiveLabel: 'Effective from',
  prevails:
    'UniverLab is a Colombian project and this page exists in Spanish and English. If the two disagree, the Spanish version prevails.',
  credit:
    'Based on templates by General Legal (general.legal), released under CC0 1.0, adapted to Colombian law and to what UniverLab services actually do.',
  sections: [
    {
      id: 'responsible-party',
      title: 'Responsible party',
      paras: [
        'The party responsible for processing your data (<em>responsable del tratamiento</em> under Ley 1581 de 2012) is <strong>UniverLab</strong>, an independent laboratory run from <strong>Colombia</strong>.',
        'To exercise any right in this policy, write to <a href="mailto:{email}">{email}</a>. That address reaches the lab directly.',
      ],
    },
    {
      id: 'what-we-collect',
      title: 'What we collect, per service',
      paras: [
        'Each service below collects only what it needs to work. Nothing here is used for advertising or marketing, nothing trains models, and nothing is sold.',
        '<strong>univerlab.org and the announcements feed.</strong> No accounts, no sign-in, no tracking cookies. Reading pages or the feed leaves no profile of you. Like every site, requests pass through the host infrastructure, so Cloudflare keeps its own request logs of the connections it serves.',
        '<strong>graphs.univerlab.org.</strong> The catalogue shows only public repositories that carry the <code>canopy-graph</code> topic: the owner login, the repository name, its description, stars, last update date, and the published graph and node documents with their READMEs.',
        'It reads that data from GitHub and keeps temporary copies at Cloudflare only to serve the catalogue. A document or repository removed from GitHub, or stripped of the topic, leaves the catalogue within 30 minutes.',
        // 30-minute upper bound vs TTL in canopy-web apps/graphs/src/github.ts
        // (search 600 s, documents 1800 s) and the planned 15-minute index cron.
        'Install counts record the document, a client class (canopy CLI, browser or other), the canopy version, the country Cloudflare derives, and the outcome. They hold no IP address, no full user-agent and no cookie. Counts are stored by Cloudflare Analytics Engine and shown as 90-day totals.',
        // 90-day totals vs DOWNLOAD_WINDOW_DAYS in canopy-web apps/graphs/src/analytics.ts.
        '<strong>remote.univerlab.org.</strong> Signing in with GitHub stores your GitHub numeric id and login in a signed session cookie that expires after 12 hours. The GitHub sign-in token is discarded at once. The relay stores nothing and only forwards the signalling that connects a browser to its owner\u2019s canopy host. Sessions travel peer to peer, encrypted end to end (WebRTC DTLS), with Cloudflare TURN relaying ciphertext when a direct path fails. Device keys stay in the browser and on the host.',
        // 12-hour cookie vs SESSION_TTL_S in canopy-web apps/remote/worker/src/auth.ts.
        '<strong>canopy CLI and daemon.</strong> Your data stays local in <code>~/.canopy</code> on your own machine. UniverLab services are contacted only when you use them: fetching a graph from the catalogue, or pairing through the relay. Agent harnesses (Claude, Codex and the rest) are governed by their own providers\u2019 terms.',
        '<strong>Reports.</strong> Bug reports and catalogue reports are GitHub issues in public repositories: whatever you write there is public under GitHub\u2019s terms.',
      ],
    },
    {
      id: 'purposes',
      title: 'Purposes',
      paras: ['One line per service:'],
      items: [
        'univerlab.org and the feed: publishing the lab\u2019s pages and logbook.',
        'graphs.univerlab.org: serving a catalogue of public community graphs and counting installs in aggregate.',
        'remote.univerlab.org: keeping you signed in for 12 hours so your browser can reach your own canopy host.',
        'canopy CLI and daemon: running your graphs on your machine; contacting UniverLab services only for the fetch or pairing you asked for.',
      ],
    },
    {
      id: 'legal-bases',
      title: 'Legal bases',
      paras: [
        'Under Ley 1581 de 2012, we process your data on these bases. For readers under the GDPR, the equivalent basis follows in brackets.',
        'The sign-in is your authorisation (<em>autorizaci\u00f3n</em>): signing in with GitHub authorises the 12-hour session cookie [GDPR: consent].',
        'Catalogue data is data of a public nature published by its author (Ley 1581, article 10): public repositories its owners chose to tag, processed for the catalogue only [GDPR: legitimate interest in running a public catalogue of public data].',
        'The install counter is the lab\u2019s legitimate interest in aggregate, non-identifying statistics about which documents get installed [GDPR: legitimate interest].',
      ],
    },
    {
      id: 'processors-transfer',
      title: 'Processors and international transfer',
      paras: [
        'Two providers process data on our behalf, both in the United States, so your data leaves Colombia when you use the services:',
      ],
      items: [
        'Cloudflare: hosting, caching, Analytics Engine install counts and TURN relaying.',
        'GitHub: sign-in identity and the public source data the catalogue reads.',
      ],
      links: [
        { label: 'Cloudflare privacy statement', href: 'https://www.cloudflare.com/privacypolicy/' },
        { label: 'GitHub privacy statement', href: 'https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement' },
      ],
    },
    {
      id: 'retention',
      title: 'Retention',
      paras: ['How long each figure above lasts:'],
      items: [
        'univerlab.org: no accounts and no tracking cookies, so nothing of yours is retained; Cloudflare keeps its own request logs under its policy.',
        // 30-minute bound vs TTL in canopy-web apps/graphs/src/github.ts (and the planned index cron).
        'Catalogue copies: temporary, refreshed from GitHub; removals leave the catalogue within 30 minutes.',
        // 90 days vs DOWNLOAD_WINDOW_DAYS in canopy-web apps/graphs/src/analytics.ts.
        'Install counts: 90-day totals, with no IP address, no full user-agent and no cookie behind them.',
        // 12 hours vs SESSION_TTL_S in canopy-web apps/remote/worker/src/auth.ts.
        'Remote session cookie: 12 hours, then it expires; the sign-in token is discarded at once and the relay stores nothing.',
        'canopy CLI and daemon: your data stays in ~/.canopy until you remove it.',
      ],
    },
    {
      id: 'rights',
      title: 'Your rights',
      paras: [
        'As a data subject (<em>titular</em>) you hold the rights of Ley 1581, article 8: to know, update and rectify your data; to request proof of your authorisation; to be informed of how your data is used; to revoke your authorisation and request deletion; and to complain to the Superintendencia de Industria y Comercio (SIC). Access is free.',
        'Under the GDPR you equivalently hold access, rectification, erasure, restriction, portability and objection, and you may withdraw consent at any time.',
      ],
    },
    {
      id: 'procedure',
      title: 'How to exercise them',
      paras: [
        'Write to <a href="mailto:{email}">{email}</a>. Queries (<em>consultas</em>) are answered within 10 business days, extendable once by 5; claims (<em>reclamos</em>) within 15 business days, extendable once by 8 (Ley 1581, articles 14 and 15).',
        'Catalogue data has a shorter path too: the author removes a document by dropping the <code>canopy-graph</code> topic or the repository, or anyone may report a document by opening an issue in UniverLab/canopy-web.',
      ],
    },
    {
      id: 'security-children-changes',
      title: 'Security, children, changes',
      paras: [
        '<strong>Security.</strong> The services rely on Cloudflare and GitHub safeguards, the signed session cookie and end-to-end encrypted relay sessions. No internet service can guarantee security, and you should not send sensitive data through reports or issues, which are public.',
        '<strong>Children.</strong> The services are not directed to anyone under 18.',
        '<strong>Changes.</strong> This policy changes by dated revision: the date above moves and the effective date moves with it.',
      ],
    },
  ],
};

export const termsEn: LegalDoc = {
  title: 'Terms of Use — UniverLab services',
  description:
    'The rules for using UniverLab sites and tools: acceptable use, community graphs, code licences, disclaimers, liability, and Colombian law.',
  kicker: 'Legal',
  heading: 'Terms of Use',
  intro:
    'These terms govern univerlab.org, the announcements feed, the graphs catalogue, the remote relay and the canopy tools. They are written in plain language: use the services lawfully, install community graphs at your own judgement, and know what UniverLab does and does not promise.',
  updatedLabel: 'Last updated',
  effectiveLabel: 'Effective from',
  prevails:
    'UniverLab is a Colombian project and these terms exist in Spanish and English. If the two disagree, the Spanish version prevails.',
  credit:
    'Based on templates by General Legal (general.legal), released under CC0 1.0, adapted to Colombian law and to what UniverLab services actually do.',
  sections: [
    {
      id: 'using-the-services',
      title: 'Using the services',
      paras: [
        'UniverLab grants you a limited, non-exclusive, non-transferable, revocable licence to access and use the services for your own lawful purposes. You must be at least 18 years old.',
        'UniverLab may modify, suspend or discontinue any service, or your access to it, at any time, with or without notice. There is no support obligation: the services are run as an open laboratory, not a contracted product.',
        'Your use of the services is also governed by the <a href="/privacy/">Privacy Policy</a>, which describes what data each service records. If these terms and the policy disagree about data, the policy controls.',
      ],
    },
    {
      id: 'acceptable-use',
      title: 'Acceptable use',
      paras: ['When you use the services, you agree not to:'],
      items: [
        'Break the law, or use the services to harm, harass, deceive or exploit anyone.',
        'Probe, disrupt or overload the services: no scraping the catalogue to evade its limits, no flooding the relay, no forging session cookies.',
        'Impersonate UniverLab, its maintainers or another user, or misrepresent a community graph as lab-reviewed.',
        'Post unlawful or abusive content in public reports and issues.',
        'Use the services to build a competing catalogue or relay by copying them wholesale.',
      ],
    },
    {
      id: 'community-graphs',
      title: 'Community graphs and nodes',
      paras: [
        'The graphs catalogue lists community documents that UniverLab does not review. A catalogue entry is third-party content: its code, commands and agent instructions come from its author, not from the lab.',
        'Installing a graph lets canopy run its commands and agent instructions on your machine with your permissions. Read a document before you install it, the way you would read a script before piping it to a shell. You are responsible for what you install and run.',
        'Anyone can report a document by opening an issue in the UniverLab/canopy-web repository on GitHub. UniverLab\u2019s maintainers may remove reported documents from the catalogue. An author removes their own document by dropping the <code>canopy-graph</code> topic or the repository.',
      ],
    },
    {
      id: 'third-party',
      title: 'Third-party content and services',
      paras: [
        'The services lean on third parties: GitHub for sign-in and source data, Cloudflare for hosting, caching, analytics and relaying, and the agent-harness providers whose models run inside canopy. Their own terms and privacy practices apply when you use them.',
        'Links and catalogue entries may point outside UniverLab. We do not control, endorse or take responsibility for third-party content and services; you use them at your own risk.',
      ],
    },
    {
      id: 'intellectual-property',
      title: 'Intellectual property',
      paras: [
        'The sites and their content belong to UniverLab or its contributors; these terms transfer no ownership to you. The open-source code stays under its repositories\u2019 licences: the platform repositories under Apache-2.0 and the CLIs under MIT. Those licences, not these terms, govern what you may do with the code.',
        'If you send feedback or suggestions, you grant UniverLab a perpetual, worldwide, royalty-free licence to use it freely, without attribution. Do not send anything you consider confidential.',
      ],
    },
    {
      id: 'disclaimers',
      title: 'Disclaimer of warranties',
      paras: [
        'The services are provided \u201cas is\u201d and \u201cas available\u201d. To the fullest extent permitted by law, UniverLab disclaims all warranties, express or implied, including merchantability, fitness for a particular purpose, title and non-infringement. We do not warrant that the services will be uninterrupted, error-free, secure or free of harmful code.',
      ],
    },
    {
      id: 'liability',
      title: 'Limitation of liability',
      paras: [
        'To the maximum extent permitted by law, UniverLab is not liable for lost profits or data, the cost of substitutes, or any indirect, incidental, special or consequential damages arising from your use of the services. Our total liability for any claim is capped at USD 50.',
        'Nothing in these terms limits rights that consumer law (Ley 1480 de 2011) or data-protection law makes non-waivable.',
      ],
    },
    {
      id: 'termination',
      title: 'Termination of access',
      paras: [
        'These terms apply while you use the services. UniverLab may suspend or terminate your access at any time, including when it believes you have violated these terms. The intellectual-property, disclaimer, liability and governing-law sections survive termination.',
      ],
    },
    {
      id: 'changes',
      title: 'Changes to the terms',
      paras: [
        'UniverLab may update these terms; material changes are announced and dated. Your continued use of the services after a change means you accept the updated terms. The date above always shows the current revision and the day it took effect.',
      ],
    },
    {
      id: 'general',
      title: 'General provisions',
      paras: [
        'These terms, with the Privacy Policy, are the whole agreement between you and UniverLab for the services. If any provision is invalid, the rest stand; a failure to enforce one provision is not a waiver of it.',
        'These terms are governed by the laws of the Republic of Colombia, and disputes go to its competent courts.',
      ],
    },
  ],
};
