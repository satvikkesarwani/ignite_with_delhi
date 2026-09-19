import { useEffect, useRef, useState } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Database,
  MessageSquare,
  X,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProfileDrawer, PERSONA_TONE } from './ProfileDrawer';
import { cn } from '@/lib/utils';

const TRACKS = [
  'ML / AI & Knowledge Graphs',
  'Full Stack Web',
  'Systems & Infrastructure',
  'Web3 & Distributed Systems',
  'Mobile & Edge Computing',
];

const INITIAL_STAGES = [
  { id: 'parse_resume', name: 'Parse resume PDF', status: 'pending', ms: null, detail: null },
  {
    id: 'structure_llm',
    name: 'Structure with Nemotron',
    status: 'pending',
    ms: null,
    detail: null,
  },
  {
    id: 'enrich_external',
    name: 'Enrich from web & GitHub',
    status: 'pending',
    ms: null,
    detail: null,
  },
  { id: 'write_graph', name: 'Write to graph', status: 'pending', ms: null, detail: null },
  { id: 'build_profile', name: 'Synthesize profile', status: 'pending', ms: null, detail: null },
];

export function IntakeView({ onNavigate }) {
  // Form fields
  const [formData, setFormData] = useState({
    fullName: 'Aarav Patel',
    email: 'aarav.patel@nsut.ac.in',
    phone: '+91 98765 43210',
    college: 'Netaji Subhas University of Technology',
    city: 'Delhi',
    track: TRACKS[0],
    githubUrl: 'https://github.com/aaravpatel-ai',
  });

  // Inline validation state on blur
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});

  const [resumeFile, setResumeFile] = useState({
    name: 'Aarav_Patel_Resume.pdf',
    size: 342000, // ~334 KB
  });

  const [fileError, setFileError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Stepper & Pipeline state
  const [isRunning, setIsRunning] = useState(false);
  const [stages, setStages] = useState(INITIAL_STAGES);
  const [cogneeStatus, setCogneeStatus] = useState('idle'); // idle | queued | indexing | done
  const [elapsedSec, setElapsedSec] = useState('0.0');
  const [fastMode, setFastMode] = useState(true); // default fast for snappy testing

  // Result state
  const [resultProfile, setResultProfile] = useState(null);
  const [drawerUserId, setDrawerUserId] = useState(null);
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [failedStageError, setFailedStageError] = useState(null);

  // Field validation on blur
  const validateField = (field, value) => {
    let err = null;
    if (field === 'fullName' && !value.trim()) {
      err = 'Full name is required';
    } else if (field === 'email') {
      if (!value.trim()) err = 'Email address is required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) err = 'Invalid email address';
    } else if (field === 'college' && !value.trim()) {
      err = 'College name is required';
    }
    setErrors((prev) => ({ ...prev, [field]: err }));
    return err;
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    validateField(field, formData[field]);
  };

  // Live timer while running
  useEffect(() => {
    let interval = null;
    if (isRunning) {
      const start = Date.now();
      interval = setInterval(() => {
        const total = (Date.now() - start) / 1000;
        setElapsedSec(total.toFixed(1));
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  // Handle PDF file drop / selection
  const handleFile = (file) => {
    setFileError(null);
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setFileError('Invalid file type. Only PDF documents are accepted.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFileError('File exceeds 10MB size limit. Please upload a smaller resume.');
      return;
    }

    setResumeFile(file);
  };

  // Run the multi-stage pipeline
  const startPipeline = async () => {
    if (isRunning) return;

    // Check validation
    const nameErr = validateField('fullName', formData.fullName);
    const emailErr = validateField('email', formData.email);
    const colErr = validateField('college', formData.college);
    if (nameErr || emailErr || colErr || !resumeFile) {
      setTouched({ fullName: true, email: true, college: true });
      return;
    }

    setIsRunning(true);
    setResultProfile(null);
    setFailedStageError(null);
    setCogneeStatus('idle');

    // Reset stages
    setStages(INITIAL_STAGES.map((s) => ({ ...s, status: 'pending', ms: null, detail: null })));

    // Helper to update stage status
    const updateStage = (id, updates) => {
      setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    };

    // Delays: fast demo vs realistic
    const d1 = fastMode ? 600 : 900;
    const d3 = fastMode ? 1400 : 2900;
    const d2 = fastMode ? 1800 : 24100;
    const d4 = fastMode ? 500 : 800;
    const d5 = fastMode ? 700 : 1400;

    try {
      // Stage 1: Parse resume
      updateStage('parse_resume', { status: 'running', detail: 'Reading document stream' });
      await new Promise((r) => setTimeout(r, d1));
      updateStage('parse_resume', {
        status: 'done',
        ms: 840,
        detail: 'Parsed 3 pages · 4,210 tokens extracted',
      });

      // Stage 2 & Stage 3: RUN CONCURRENTLY! Both lit at once!
      updateStage('structure_llm', {
        status: 'running',
        detail: 'Nemotron structured reasoning phase active',
      });
      updateStage('enrich_external', {
        status: 'running',
        detail: 'Querying GitHub API & Tavily external signals',
      });

      // Stage 3 finishes first
      await new Promise((r) => setTimeout(r, d3));
      updateStage('enrich_external', {
        status: 'done',
        ms: 2900,
        detail: 'Verified 14 public repos, 3 ML projects',
      });

      // Stage 2 finishes next
      const remainingD2 = Math.max(200, d2 - d3);
      await new Promise((r) => setTimeout(r, remainingD2));
      updateStage('structure_llm', {
        status: 'done',
        ms: 24100,
        detail: 'Identified 12 verified skills, 4 institutions, 2 internships',
      });

      // Stage 4: Write to graph
      updateStage('write_graph', {
        status: 'running',
        detail: 'Creating Person, Skill, College, Team edges',
      });
      await new Promise((r) => setTimeout(r, d4));
      updateStage('write_graph', {
        status: 'done',
        ms: 610,
        detail: '23 graph nodes, 38 relationships committed',
      });

      // Stage 5: Synthesize profile
      updateStage('build_profile', {
        status: 'running',
        detail: 'Synthesizing narrative paragraph and engagement breakdown',
      });
      await new Promise((r) => setTimeout(r, d5));
      updateStage('build_profile', {
        status: 'done',
        ms: 1400,
        detail: 'Engagement score 82/100 computed',
      });

      // Enqueue Cognee in background (async sidecar)
      setCogneeStatus('queued');
      setTimeout(() => setCogneeStatus('indexing'), 1500);
      setTimeout(() => setCogneeStatus('done'), 4200);

      // Check returning status if Aarav was registered before
      const isExisting = formData.fullName.toLowerCase().includes('returning');
      setIsReturningUser(isExisting);

      // Result ContextProfile
      setResultProfile({
        user_id: 'U0601',
        identity: {
          full_name: formData.fullName,
          email: formData.email,
          college: formData.college,
          city: formData.city,
          role_pref: formData.track,
          grad_year: 2026,
          github_username: formData.githubUrl.split('/').pop() || 'aaravpatel-ai',
          linkedin_url: 'https://linkedin.com/in/aarav-patel',
          consent_flag: true,
        },
        personas: ['Rising Star', 'Consistent Builder'],
        engagement: {
          value: 82,
          components: { recency: 95, frequency: 78, depth: 85, outcome: 70 },
        },
        narrative: `${formData.fullName} is an upcoming ML and systems engineer from ${formData.college}. Their verified public work highlights strong implementations in graph querying, RAG pipelines, and high-frequency backend services.`,
        skills: [
          {
            skill: 'Python',
            confidence: 0.94,
            cluster: 'ML/AI',
            claim_gap: false,
            hidden_strength: false,
            sources: [{ type: 'github', detail: '14 public repos', weight: 0.9 }],
          },
          {
            skill: 'PyTorch',
            confidence: 0.88,
            cluster: 'ML/AI',
            claim_gap: false,
            hidden_strength: false,
            sources: [{ type: 'project', detail: 'built P0143', weight: 0.8 }],
          },
          {
            skill: 'Neo4j',
            confidence: 0.85,
            cluster: 'Graph',
            claim_gap: false,
            hidden_strength: true,
            sources: [{ type: 'github', detail: 'AuraDB graph commits', weight: 0.85 }],
          },
          {
            skill: 'FastAPI',
            confidence: 0.82,
            cluster: 'Backend',
            claim_gap: false,
            hidden_strength: false,
            sources: [{ type: 'declared', detail: 'resume', weight: 0.7 }],
          },
        ],
        facts: {
          hackathons_registered: 3,
          hackathons_attended: 3,
          no_shows: 0,
          projects_submitted: 3,
          submission_rate: 1.0,
          prizes: [
            {
              hackathon: 'Ignite Delhi Winter',
              hackathon_id: 'H019',
              rank: 2,
              prize_track: 'ML/AI',
              date: '2026-01-18',
              score: 88,
            },
          ],
          prize_count: 1,
          best_rank: 2,
          avg_score: 88.0,
          first_seen: '2025-11-10',
          last_active: '2026-09-15',
          days_since_active: 4,
          mentor_sessions: 2,
          avg_mentor_score: 4.8,
          interactions: 14,
          distinct_teammates: 6,
        },
        trajectory: {
          direction: 'rising',
          status: 'active',
          score_series: [
            { date: '2025-11-10', score: 76, hackathon_id: 'H016' },
            { date: '2026-01-18', score: 88, hackathon_id: 'H019' },
          ],
          tech_drift: { from: ['React', 'Express'], to: ['Neo4j', 'FastAPI'] },
        },
        data_sources: ['resume', 'github_live', 'tavily'],
        narrative_status: 'llm',
        evidenceCount: isExisting ? 24 : 18,
        previousEvidenceCount: isExisting ? 18 : 0,
        evidence: [
          {
            claim: 'Parsed 12 verified skills from resume PDF',
            source_type: 'resume',
            source_ref: 'resume_pdf#aarav',
            observed_at: '2026-09-19',
            confidence: 0.95,
          },
          {
            claim: 'Verified 14 public GitHub repos with Neo4j and Python code',
            source_type: 'github_live',
            source_ref: 'github.com/aaravpatel-ai',
            observed_at: '2026-09-19',
            confidence: 0.92,
          },
          {
            claim: '2nd place winner at Ignite Delhi Winter in ML/AI track',
            source_type: 'platform',
            source_ref: 'results.csv#P019',
            observed_at: '2026-01-18',
            confidence: 1.0,
          },
        ],
      });
    } catch (err) {
      setFailedStageError(err.message || 'Pipeline execution failed');
    } finally {
      setIsRunning(false);
    }
  };

  // Calculate disabled reason for submit
  const getDisabledReason = () => {
    if (!formData.fullName.trim()) return 'Enter candidate full name';
    if (!formData.email.trim()) return 'Enter candidate email';
    if (!formData.college.trim()) return 'Enter candidate college';
    if (!resumeFile) return 'Upload a resume PDF (≤10MB)';
    return null;
  };

  const disabledReason = getDisabledReason();
  const isFormValid = !disabledReason;

  return (
    <div className="flex gap-8 pt-1">
      {/* =========================================================================
          LEFT COLUMN (440px): Intake Form & Resume Dropzone
      ========================================================================= */}
      <div className="w-[440px] shrink-0 space-y-4 border-r border-border pr-8">
        <div>
          <div className="flex items-center justify-between">
            <span className="crm-num text-[11px] uppercase tracking-[0.14em] text-accent">
              Intake Ingestion Engine
            </span>
            {/* Fast mode demo toggle */}
            <button
              type="button"
              onClick={() => setFastMode(!fastMode)}
              className="flex items-center gap-1 font-mono text-[10.5px] text-faint hover:text-accent transition-colors"
              title="Toggle fast simulation vs realistic 25s Nemotron timer"
            >
              <Zap size={11} className={fastMode ? 'text-accent' : 'text-faint'} />
              <span>{fastMode ? 'Fast demo (4s)' : 'Realistic (28s)'}</span>
            </button>
          </div>
          <h2 className="font-serif mt-1 text-[20px] font-semibold text-text">
            Register Participant
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            Submit candidate credentials and upload their resume. The context layer parses signals,
            verifies public repos, and synthesizes an intelligence profile.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            startPipeline();
          }}
          className="space-y-3"
        >
          {/* Full Name */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="crm-num text-[10.5px] uppercase tracking-[0.08em] text-faint">
                Full Name *
              </label>
              {touched.fullName && errors.fullName && (
                <span className="text-[11px] text-danger">{errors.fullName}</span>
              )}
            </div>
            <Input
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              onBlur={() => handleBlur('fullName')}
              placeholder="e.g. Shiv Sharma"
              disabled={isRunning}
              className={cn(
                'text-[12.5px] h-8',
                touched.fullName &&
                  errors.fullName &&
                  'border-danger/60 focus-visible:border-danger'
              )}
            />
          </div>

          {/* Email & Phone */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="crm-num text-[10.5px] uppercase tracking-[0.08em] text-faint">
                  Email *
                </label>
              </div>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                onBlur={() => handleBlur('email')}
                placeholder="name@college.edu"
                disabled={isRunning}
                className={cn(
                  'text-[12.5px] h-8',
                  touched.email && errors.email && 'border-danger/60 focus-visible:border-danger'
                )}
              />
              {touched.email && errors.email && (
                <span className="text-[10.5px] text-danger block">{errors.email}</span>
              )}
            </div>
            <div className="space-y-1">
              <label className="crm-num text-[10.5px] uppercase tracking-[0.08em] text-faint">
                Phone
              </label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+91..."
                disabled={isRunning}
                className="text-[12.5px] h-8"
              />
            </div>
          </div>

          {/* College & City */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="crm-num text-[10.5px] uppercase tracking-[0.08em] text-faint">
                  College / Institution *
                </label>
              </div>
              <Input
                value={formData.college}
                onChange={(e) => setFormData({ ...formData, college: e.target.value })}
                onBlur={() => handleBlur('college')}
                placeholder="e.g. IIT Delhi"
                disabled={isRunning}
                className={cn(
                  'text-[12.5px] h-8',
                  touched.college &&
                    errors.college &&
                    'border-danger/60 focus-visible:border-danger'
                )}
              />
              {touched.college && errors.college && (
                <span className="text-[10.5px] text-danger block">{errors.college}</span>
              )}
            </div>
            <div className="space-y-1">
              <label className="crm-num text-[10.5px] uppercase tracking-[0.08em] text-faint">
                City
              </label>
              <Input
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="e.g. Delhi"
                disabled={isRunning}
                className="text-[12.5px] h-8"
              />
            </div>
          </div>

          {/* Track Preference */}
          <div className="space-y-1">
            <label className="crm-num text-[10.5px] uppercase tracking-[0.08em] text-faint">
              Primary Hackathon Track
            </label>
            <select
              value={formData.track}
              onChange={(e) => setFormData({ ...formData, track: e.target.value })}
              disabled={isRunning}
              className="w-full h-8 rounded border border-border bg-surface px-2.5 text-[12px] text-text hover:border-border-strong focus-visible:border-accent focus-visible:outline-none"
            >
              {TRACKS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* GitHub / Portfolio */}
          <div className="space-y-1">
            <label className="crm-num text-[10.5px] uppercase tracking-[0.08em] text-faint">
              GitHub or Portfolio URL
            </label>
            <Input
              value={formData.githubUrl}
              onChange={(e) => setFormData({ ...formData, githubUrl: e.target.value })}
              placeholder="https://github.com/..."
              disabled={isRunning}
              className="text-[12.5px] h-8 font-mono"
            />
          </div>

          {/* Resume PDF Dropzone */}
          <div className="space-y-1 pt-1">
            <label className="crm-num text-[10.5px] uppercase tracking-[0.08em] text-faint">
              Resume Document (PDF ≤ 10MB) *
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.[0]) {
                  handleFile(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'cursor-pointer rounded border border-dashed p-4 text-center transition-colors duration-100',
                dragOver
                  ? 'border-accent bg-accent/10'
                  : 'border-border-strong bg-surface/40 hover:border-accent',
                fileError && 'border-danger/60 bg-danger/5'
              )}
            >
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf,application/pdf"
                onChange={(e) => handleFile(e.target.files?.[0])}
                className="hidden"
              />
              {resumeFile ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-left truncate">
                    <FileText size={18} className="text-accent shrink-0" />
                    <div className="truncate">
                      <div className="text-[12.5px] font-medium text-text truncate">
                        {resumeFile.name}
                      </div>
                      <div className="crm-num text-[10.5px] text-faint font-mono">
                        {Math.round(resumeFile.size / 1024)} KB · Ready to parse
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setResumeFile(null);
                    }}
                    className="text-faint hover:text-text p-1"
                    aria-label="Remove resume"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div>
                  <Upload size={18} className="mx-auto text-faint mb-1.5" />
                  <div className="text-[12.5px] text-muted">
                    Click to select or drag and drop resume PDF
                  </div>
                  <div className="crm-num mt-0.5 text-[10.5px] text-faint">
                    pdf-parse + Nemotron structured extraction
                  </div>
                </div>
              )}
            </div>
            {fileError && (
              <div className="flex items-center gap-1.5 text-[11.5px] text-danger mt-1">
                <AlertCircle size={13} />
                <span>{fileError}</span>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <Button
              type="submit"
              variant="default"
              disabled={isRunning || !isFormValid}
              className="w-full h-9 text-[13px] gap-2 font-medium"
            >
              {isRunning ? (
                <>
                  <span className="size-1.5 rounded-full bg-accent-ink animate-ping" />
                  <span>Pipeline running ({elapsedSec}s)…</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>Submit & build context</span>
                </>
              )}
            </Button>
            {!isFormValid && (
              <div className="crm-num text-[11px] text-warning text-center mt-1.5 font-mono">
                Required: {disabledReason}
              </div>
            )}
          </div>
        </form>
      </div>

      {/* =========================================================================
          RIGHT COLUMN: Live Pipeline Stepper & Resulting Profile Card
      ========================================================================= */}
      <div className="flex-1 space-y-6">
        {/* Pipeline Stepper Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <span className="crm-num text-[11px] uppercase tracking-[0.14em] text-muted">
              Live Synthesis Stepper
            </span>
            <div className="font-serif text-[18px] font-semibold text-text mt-0.5">
              Context Layer Execution Stages
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isRunning && (
              <span className="crm-num text-[12px] text-accent font-mono">
                Elapsed: {elapsedSec}s
              </span>
            )}
            <Badge tone={isRunning ? 'accent' : resultProfile ? 'positive' : 'neutral'}>
              {isRunning ? 'IN FLIGHT' : resultProfile ? 'COMPLETED' : 'STANDBY'}
            </Badge>
          </div>
        </div>

        {/* Failed stage alert with partial profile recovery */}
        {failedStageError && (
          <div className="rounded border border-danger/50 bg-danger/10 p-3.5 text-[12.5px] text-danger flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} />
              <span>Pipeline warning: {failedStageError}. Preserving completed source stages.</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={startPipeline}
              className="h-7 text-[11.5px] gap-1"
            >
              <RotateCcw size={12} /> Retry
            </Button>
          </div>
        )}

        {/* When resultProfile is ready, SWAP to the profile card per B3 spec */}
        {resultProfile ? (
          <div className="space-y-4">
            {/* View toggle header */}
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-positive" />
                <span className="crm-num text-[11px] uppercase tracking-[0.1em] text-positive font-mono">
                  Context Profile Synthesized
                </span>
              </div>
              <button
                type="button"
                onClick={() => setResultProfile(null)}
                className="crm-num text-[11px] text-muted hover:text-text font-mono underline"
              >
                ← Back to Pipeline Stepper
              </button>
            </div>

            {/* Profile Card */}
            <div className="rounded border border-border bg-surface p-5 space-y-4">
              {/* Existing Participant Banner if returning */}
              {isReturningUser && (
                <div className="flex items-center justify-between border border-positive/50 bg-positive/10 px-3.5 py-2 text-[12px] text-positive rounded-sm">
                  <span>Existing participant — profile enriched with new signals</span>
                  <span className="crm-num text-[11px] font-mono">
                    {resultProfile.previousEvidenceCount} → {resultProfile.evidenceCount} evidence
                    items
                  </span>
                </div>
              )}

              <div className="flex items-start justify-between">
                <div>
                  <div className="crm-num text-[11px] uppercase tracking-[0.12em] text-accent font-mono">
                    Context Profile Created · {resultProfile.user_id}
                  </div>
                  <h3 className="font-serif text-[22px] font-semibold text-text mt-0.5">
                    {resultProfile.identity.full_name}
                  </h3>
                  <div className="text-[12.5px] text-muted">
                    {resultProfile.identity.college} · {resultProfile.identity.city}
                  </div>
                </div>
                <div className="text-right">
                  <div className="crm-num text-[10.5px] uppercase tracking-[0.1em] text-faint">
                    Engagement
                  </div>
                  <div className="crm-num text-[26px] font-semibold text-text leading-none mt-0.5 font-mono">
                    {resultProfile.engagement.value}
                    <span className="text-[12px] text-faint font-normal"> / 100</span>
                  </div>
                </div>
              </div>

              {/* Synthesized Narrative */}
              <div className="border-l-2 border-accent bg-bg/50 pl-3.5 py-2 text-[13.5px] leading-relaxed text-text/95">
                {resultProfile.narrative}
              </div>

              {/* Personas & Top Skills with confidence */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <div className="flex items-center gap-1.5">
                  {resultProfile.personas.map((p) => (
                    <Badge key={p} tone={PERSONA_TONE[p] || 'neutral'}>
                      {p}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {resultProfile.skills.map((s) => (
                    <span
                      key={s.skill}
                      className="crm-num rounded-sm border border-border bg-bg/60 px-1.5 py-0.5 text-[10.5px] text-muted font-mono"
                    >
                      {s.skill} ({Math.round(s.confidence * 100)}%)
                    </span>
                  ))}
                </div>
              </div>

              {/* Evidence count summary */}
              <div className="flex items-center justify-between border-t border-border pt-2 text-[11.5px] text-muted font-mono">
                <span>
                  Verified Evidence Points:{' '}
                  <strong className="text-text">{resultProfile.evidenceCount} claims</strong>
                </span>
                <span>
                  Semantic Memory: <strong className="text-positive">Indexed</strong>
                </span>
              </div>

              {/* Action Navigation Buttons */}
              <div className="flex items-center justify-end gap-2.5 border-t border-border pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDrawerUserId(resultProfile.user_id)}
                  className="gap-1.5 text-[12px]"
                >
                  <Database size={13} />
                  <span>View in database →</span>
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    if (onNavigate) {
                      onNavigate(
                        `/crm/scout?q=${encodeURIComponent(
                          `Tell me about ${resultProfile.identity.full_name}`
                        )}`
                      );
                    }
                  }}
                  className="gap-1.5 text-[12px]"
                >
                  <MessageSquare size={13} />
                  <span>Ask the Scout about them →</span>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* 5-STAGE STEPPER */
          <div className="space-y-3">
            {stages.map((stage, idx) => {
              const isPending = stage.status === 'pending';
              const isRunningStage = stage.status === 'running';
              const isDone = stage.status === 'done';
              const isFailed = stage.status === 'failed';
              const isConcurrent = stage.id === 'structure_llm' || stage.id === 'enrich_external';

              return (
                <div
                  key={stage.id}
                  className={cn(
                    'relative rounded border p-3 transition-colors duration-120',
                    isPending && 'border-border/60 bg-surface/20 text-muted opacity-65',
                    isRunningStage && 'border-accent bg-accent/5 text-text ring-1 ring-accent/30',
                    isDone && 'border-border bg-surface/40 text-text',
                    isFailed && 'border-danger/60 bg-danger/10 text-danger'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="crm-num text-[11px] text-faint font-mono">0{idx + 1}</span>
                      <span className="text-[13.5px] font-medium text-text">{stage.name}</span>
                      {isConcurrent && (
                        <span className="crm-num text-[9.5px] uppercase tracking-[0.06em] text-accent border border-accent/40 bg-accent/10 px-1 py-px rounded-sm font-mono">
                          concurrent
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {stage.ms && (
                        <span className="crm-num text-[11.5px] text-muted font-mono">
                          {stage.ms.toLocaleString()}ms
                        </span>
                      )}
                      {isDone && (
                        <span className="text-positive flex items-center gap-1 text-[11px] font-mono uppercase">
                          <CheckCircle2 size={13} /> done
                        </span>
                      )}
                      {isRunningStage && (
                        <span className="text-accent flex items-center gap-1.5 text-[11px] font-mono">
                          <Clock size={12} className="animate-spin" /> running…
                        </span>
                      )}
                      {isFailed && (
                        <span className="text-danger flex items-center gap-1 text-[11px] font-mono uppercase">
                          <AlertCircle size={13} /> failed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Live backend details */}
                  {stage.detail && (
                    <div className="crm-num mt-1.5 text-[11.5px] text-faint pl-6 font-mono">
                      ↳ {stage.detail}
                    </div>
                  )}

                  {/* Active 2px animated underline indicator for running stage */}
                  {isRunningStage && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent animate-pulse" />
                  )}
                </div>
              );
            })}

            {/* Asynchronous Background Cognee Job Row */}
            <div className="rounded border border-border/70 bg-bg/50 px-3.5 py-2.5 flex items-center justify-between text-[11.5px]">
              <div className="flex items-center gap-2">
                <span className="crm-num uppercase tracking-[0.1em] text-faint font-mono text-[10.5px]">
                  Semantic Memory
                </span>
                <span className="text-border">·</span>
                <span className="text-muted">
                  Cognee semantic vector sidecar (async background task)
                </span>
              </div>
              <span
                className={cn(
                  'crm-num font-mono text-[10.5px] uppercase tracking-[0.08em]',
                  cogneeStatus === 'idle' && 'text-faint',
                  cogneeStatus === 'queued' && 'text-warning',
                  cogneeStatus === 'indexing' && 'text-accent',
                  cogneeStatus === 'done' && 'text-positive'
                )}
              >
                [{cogneeStatus}]
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Context Profile Drawer for newly created candidate */}
      <ProfileDrawer
        userId={drawerUserId}
        onClose={() => setDrawerUserId(null)}
        initialProfile={resultProfile}
      />
    </div>
  );
}

export default IntakeView;
