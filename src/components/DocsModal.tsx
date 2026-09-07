import React, { useState } from 'react';
import { X, BookOpen, Shield, GitBranch, Cpu, Server } from 'lucide-react';

interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const docsContent = {
  architecture: {
    title: 'Architecture Overview',
    icon: Cpu,
    content: `### System Architecture & Pipeline

1. **Unauthenticated Public Discovery Subsystem**
   - Pure HTTP client querying GitHub REST API v3 (\`https://api.github.com/users/{username}/repos\`).
   - Strict pagination with \`per_page=100\` until full repository enumeration.
   - Automatically drops private repos or private forks.
   - Zero-credential source posture: No password, token, or SSH key is ever accepted or stored.

2. **Destination Authentication Subsystem**
   - Direct Personal Access Token (PAT) authentication with \`repo\` scope.
   - Tokens stored exclusively in secure, encrypted HTTP-only session cookies (\`SameSite=None; Secure; HttpOnly\`).
   - Zero persistent storage of credentials on server disk; tokens are held in-memory or in encrypted session cookies only during migration execution.

3. **Background Worker & Asynchronous Queue**
   - Isolates migrations from HTTP timeouts.
   - Job State Machine: \`CREATED\` → \`PREFLIGHT\` → \`QUEUED\` → \`RUNNING\` → \`VERIFYING\` → \`COMPLETED\` / \`PARTIAL\` / \`FAILED\`.
   - Supports pausing, resuming from last checkpoint, and retrying individual failed repositories.

4. **True Git Mirror Migration Engine**
   - Mirror clones bare Git tree: \`git clone --mirror <publicSourceUrl> <isolatedTempDir>\`.
   - Transfers objects, trees, commits, tags, and branches: \`git push --mirror <destAuthUrl>\`.
   - Never rewrites commits or timestamps.
   - Complete cleanup of temporary storage in \`/tmp/github-migrations/{jobId}/{repoId}\`.`,
  },
  security: {
    title: 'Security Model & Defenses',
    icon: Shield,
    content: `### Security Defenses

- **SSRF (Server-Side Request Forgery) Prevention**:
  - Input profile URLs are validated with strict regex against \`https://github.com/{username}\`.
  - Disallows loopback (\`127.0.0.1\`, \`localhost\`), RFC 1918 private subnets, and non-HTTPS protocols (\`file://\`, \`ftp://\`).
  - Remote Git clone endpoints are constructed directly from verified GitHub API descriptors.

- **Command Injection Protection**:
  - Git operations execute via \`child_process.execFile\` passing discrete argument arrays (\`['clone', '--mirror', url, dir]\`).
  - Shell string interpolation (\`sh -c\` or \`bash -c\`) is strictly forbidden.
  - Repository names and identifiers are sanitized against strict naming rules.

- **Token & Secret Redaction**:
  - All logs, error messages, and API responses pass through real-time redaction regexes replacing GitHub tokens and bearer headers with \`[REDACTED]\`.
  - Credentials in Git remote push URLs are masked and never logged to stdout or stderr.

- **Isolated Filesystem Sandboxing**:
  - Isolated working directories in \`/tmp/github-migrations/{jobId}/{repoId}\` with automatic cleanup upon completion or failure.`,
  },
  migration: {
    title: 'Git Mirror & Attribution',
    icon: GitBranch,
    content: `### Git Mirror Mechanics & Attribution Rules

#### What Is Preserved During Mirror Push:
- **All Git Commits**: Exact commit SHAs, parent commits, and historical lineages.
- **Historical Commit Timestamps**: Original author date and committer date are preserved (commits from years ago still show their original date).
- **Commit Messages**: Historical messages remain unmodified.
- **All Git Branches**: \`main\`, \`master\`, \`develop\`, \`feature/*\`, etc.
- **All Git Tags**: Both lightweight and annotated tags.

#### GitHub Attribution Limitation (Section 16 & 17):
- Git history and GitHub account attribution operate on different layers:
  - Git commits preserve the original author email recorded when the commit was made.
  - GitHub associates commits with an account only if the commit author's email is verified on that destination account.
  - Therefore, we cannot guarantee that historical commits will appear on the destination account's contribution graph.`,
  },
  deployment: {
    title: 'Deployment & Setup',
    icon: Server,
    content: `### Production Deployment & Operation
 
- **Port**: Bound to \`0.0.0.0:3000\` behind the Cloud Run container reverse proxy.
- **Destination Authentication (PAT)**:
  - Generate a GitHub Personal Access Token (PAT) at \`https://github.com/settings/tokens/new?scopes=repo\`.
  - Classic Token: Requires \`repo\` scope for repository provisioning and mirror pushing.
  - Fine-grained Token: Requires Repository permissions \`Contents: Read and write\` and \`Administration: Read and write\`.
- **Mirror Cloning & Verification**:
  - Automatically isolates each repository in \`/tmp/github-migrations/{jobId}/{repoId}\`.
  - Performs bare mirror clone (\`git clone --mirror\`) and push (\`git push --mirror\`), preserving exact SHA-1 commit hashes, branches, and tags.`,
  },
};

type DocKey = keyof typeof docsContent;

export const DocsModal: React.FC<DocsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<DocKey>('architecture');

  if (!isOpen) return null;

  const currentDoc = docsContent[activeTab];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-4xl rounded-3xl border-2 border-[#242424] bg-[#0A0A0A] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[#1A1A1A] px-6 py-5">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-[#F27D26] stroke-[2.5]" />
            <h3 className="text-lg font-black uppercase tracking-tight text-white">System Architecture & Technical Specs</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-white/50 hover:bg-[#1A1A1A] hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b-2 border-[#1A1A1A] bg-[#050505] px-6 gap-2 overflow-x-auto">
          {(Object.keys(docsContent) as DocKey[]).map((key) => {
            const doc = docsContent[key];
            const Icon = doc.icon;
            const isActive = activeTab === key;

            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2 py-3.5 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition shrink-0 ${
                  isActive
                    ? 'border-[#F27D26] text-[#F27D26] bg-[#140E08]'
                    : 'border-transparent text-white/40 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>{doc.title}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs text-white/70 leading-relaxed font-sans font-light">
          <div className="prose prose-invert max-w-none space-y-3.5">
            {currentDoc.content.split('\n\n').map((paragraph, idx) => {
              if (paragraph.startsWith('### ')) {
                return (
                  <h4 key={idx} className="text-base font-black uppercase tracking-tight text-white border-b border-[#1C1C1C] pb-2 mt-3">
                    {paragraph.replace('### ', '')}
                  </h4>
                );
              }
              if (paragraph.startsWith('#### ')) {
                return (
                  <h5 key={idx} className="text-xs font-black uppercase tracking-wider text-[#F27D26] mt-2">
                    {paragraph.replace('#### ', '')}
                  </h5>
                );
              }
              if (paragraph.startsWith('- ') || paragraph.startsWith('1. ')) {
                return (
                  <div key={idx} className="bg-[#050505] p-4 rounded-2xl border-2 border-[#1C1C1C] font-mono text-[11px] text-white/80 whitespace-pre-wrap leading-relaxed">
                    {paragraph}
                  </div>
                );
              }
              return <p key={idx}>{paragraph}</p>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
