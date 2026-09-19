/**
 * Vocabulary pools for the PersonaCRM synthetic dataset.
 *
 * Everything the generator needs to produce text that does not read as
 * slot-filled template output: skill clusters that stay internally coherent,
 * project seeds with real problems, and large banks of sentence patterns so no
 * two descriptions share an opening.
 */

export const FIRST_NAMES_M = [
  'Aarav', 'Aditya', 'Advait', 'Akash', 'Aman', 'Ananth', 'Aniket', 'Anirudh', 'Ankit', 'Arjun',
  'Armaan', 'Aryan', 'Atharv', 'Chirag', 'Daksh', 'Darsh', 'Dev', 'Devansh', 'Dhruv', 'Gaurav',
  'Harsh', 'Hemant', 'Ishaan', 'Jatin', 'Kabir', 'Karan', 'Kartik', 'Kunal', 'Lakshya', 'Madhav',
  'Manan', 'Mayank', 'Mihir', 'Naman', 'Neel', 'Nikhil', 'Nirvaan', 'Om', 'Parth', 'Pranav',
  'Prateek', 'Raghav', 'Rahul', 'Rajat', 'Reyansh', 'Rishabh', 'Rohan', 'Rudra', 'Sahil', 'Samarth',
  'Sarthak', 'Shaurya', 'Shiv', 'Shivam', 'Siddharth', 'Tanish', 'Tanmay', 'Uday', 'Vedant', 'Vihaan',
  'Vikram', 'Vivaan', 'Yash', 'Yuvraj', 'Zayan',
];

export const FIRST_NAMES_F = [
  'Aanya', 'Aarohi', 'Aditi', 'Advika', 'Ahana', 'Akshara', 'Amrita', 'Ananya', 'Anika', 'Anjali',
  'Anvi', 'Aradhya', 'Avni', 'Bhavya', 'Charvi', 'Dia', 'Disha', 'Diya', 'Eesha', 'Gauri',
  'Hiral', 'Ira', 'Isha', 'Ishita', 'Jahnavi', 'Kavya', 'Keya', 'Khushi', 'Kiara', 'Lavanya',
  'Mahi', 'Manvi', 'Meera', 'Mishka', 'Myra', 'Naina', 'Navya', 'Neha', 'Nidhi', 'Nisha',
  'Oviya', 'Pari', 'Pihu', 'Prisha', 'Riya', 'Saanvi', 'Sahana', 'Samaira', 'Sanjana', 'Sara',
  'Shanaya', 'Shreya', 'Simran', 'Sneha', 'Tanvi', 'Tara', 'Trisha', 'Vaani', 'Vanya', 'Zara',
];

export const SURNAMES = [
  'Agarwal', 'Ahuja', 'Bansal', 'Basu', 'Bhardwaj', 'Bhat', 'Chadha', 'Chauhan', 'Chopra', 'Das',
  'Deshmukh', 'Dhillon', 'Dubey', 'Gandhi', 'Ghosh', 'Goel', 'Gupta', 'Iyer', 'Jain', 'Joshi',
  'Kapoor', 'Kaur', 'Khanna', 'Khatri', 'Krishnan', 'Kulkarni', 'Kumar', 'Malhotra', 'Malik', 'Mehta',
  'Menon', 'Mishra', 'Mittal', 'Nair', 'Nanda', 'Pandey', 'Patel', 'Pillai', 'Prasad', 'Rao',
  'Reddy', 'Sahni', 'Saxena', 'Sen', 'Sethi', 'Shah', 'Sharma', 'Shetty', 'Singh', 'Singhal',
  'Sinha', 'Srivastava', 'Subramanian', 'Tandon', 'Thakur', 'Trivedi', 'Varma', 'Verma', 'Yadav',
];

/** weight = relative popularity on the platform. variants feed the messy-data pass. */
export const COLLEGES = [
  { name: 'Delhi Technological University', short: 'DTU', city: 'Delhi', weight: 11, variants: ['DTU', 'Delhi Technological University (DTU)'] },
  { name: 'Netaji Subhas University of Technology', short: 'NSUT', city: 'Delhi', weight: 9, variants: ['NSUT', 'NSIT'] },
  { name: 'Indian Institute of Technology Delhi', short: 'IIT Delhi', city: 'Delhi', weight: 8, variants: ['IIT Delhi', 'IIT-Delhi', 'Indian Institute of Technology, Delhi'] },
  { name: 'Indraprastha Institute of Information Technology Delhi', short: 'IIIT Delhi', city: 'Delhi', weight: 8, variants: ['IIIT Delhi', 'IIIT-D'] },
  { name: 'Amity University Noida', short: 'Amity Noida', city: 'Noida', weight: 8, variants: ['Amity University', 'Amity Noida'] },
  { name: 'Jamia Millia Islamia', short: 'JMI', city: 'Delhi', weight: 6, variants: ['Jamia', 'JMI'] },
  { name: 'Indira Gandhi Delhi Technical University for Women', short: 'IGDTUW', city: 'Delhi', weight: 5, variants: ['IGDTUW', 'IGIT'] },
  { name: 'Jaypee Institute of Information Technology', short: 'JIIT Noida', city: 'Noida', weight: 5, variants: ['JIIT', 'JIIT Noida'] },
  { name: 'Bharati Vidyapeeth College of Engineering', short: 'BVCOE', city: 'Delhi', weight: 4, variants: ['BVCOE', 'BVP'] },
  { name: 'Maharaja Agrasen Institute of Technology', short: 'MAIT', city: 'Delhi', weight: 4, variants: ['MAIT'] },
  { name: 'Guru Gobind Singh Indraprastha University', short: 'GGSIPU', city: 'Delhi', weight: 4, variants: ['IPU', 'GGSIPU'] },
  { name: 'Bennett University', short: 'Bennett', city: 'Greater Noida', weight: 4, variants: ['Bennett University'] },
  { name: 'Birla Institute of Technology and Science Pilani', short: 'BITS Pilani', city: 'Pilani', weight: 4, variants: ['BITS Pilani', 'BITS'] },
  { name: 'Vellore Institute of Technology', short: 'VIT', city: 'Vellore', weight: 4, variants: ['VIT', 'VIT Vellore'] },
  { name: 'SRM Institute of Science and Technology', short: 'SRM', city: 'Chennai', weight: 3, variants: ['SRM', 'SRM IST'] },
  { name: 'Manipal Institute of Technology', short: 'MIT Manipal', city: 'Manipal', weight: 3, variants: ['MIT Manipal', 'Manipal'] },
  { name: 'Thapar Institute of Engineering and Technology', short: 'Thapar', city: 'Patiala', weight: 3, variants: ['Thapar', 'TIET'] },
  { name: 'Chitkara University', short: 'Chitkara', city: 'Chandigarh', weight: 3, variants: ['Chitkara'] },
  { name: 'Indian Institute of Technology Bombay', short: 'IIT Bombay', city: 'Mumbai', weight: 3, variants: ['IIT Bombay', 'IITB'] },
  { name: 'Indian Institute of Technology Roorkee', short: 'IIT Roorkee', city: 'Roorkee', weight: 3, variants: ['IIT Roorkee'] },
  { name: 'Ashoka University', short: 'Ashoka', city: 'Sonipat', weight: 2, variants: ['Ashoka University'] },
  { name: 'Shiv Nadar University', short: 'SNU', city: 'Greater Noida', weight: 2, variants: ['Shiv Nadar University', 'SNU'] },
  { name: 'PES University', short: 'PES', city: 'Bengaluru', weight: 2, variants: ['PES University', 'PESU'] },
  { name: 'College of Engineering Pune', short: 'COEP', city: 'Pune', weight: 2, variants: ['COEP'] },
  { name: 'International Institute of Information Technology Hyderabad', short: 'IIIT Hyderabad', city: 'Hyderabad', weight: 2, variants: ['IIIT Hyderabad', 'IIIT-H'] },
];

export const CITIES = ['Delhi', 'Noida', 'Gurugram', 'Ghaziabad', 'Faridabad', 'Bengaluru', 'Pune', 'Hyderabad', 'Mumbai', 'Chennai', 'Kolkata', 'Jaipur', 'Chandigarh', 'Lucknow', 'Indore'];

export const DEGREES = ['B.Tech', 'B.Tech', 'B.Tech', 'B.E.', 'BCA', 'M.Tech', 'MCA', 'B.Des'];
export const BRANCHES = [
  'Computer Science and Engineering', 'Information Technology', 'Electronics and Communication',
  'Computer Science and Engineering', 'Information Technology', 'Mathematics and Computing',
  'Electrical Engineering', 'Mechanical Engineering', 'Data Science', 'Artificial Intelligence',
];

export const ROLE_PREFS = ['Backend', 'Frontend', 'Full-stack', 'ML/AI', 'Data', 'Design', 'Product', 'DevOps', 'Mobile', 'Web3', 'Hardware/IoT'];
export const TEAM_ROLES = ['Lead', 'Backend', 'Frontend', 'ML/AI', 'Design', 'Product', 'Data', 'DevOps', 'Mobile', 'Member'];
export const REFERRAL_SOURCES = ['college_club', 'friend', 'instagram', 'linkedin', 'discord', 'previous_hackathon', 'google'];

/** Skill clusters keep a person's declared skills, project stack and GitHub languages coherent. */
export const SKILL_CLUSTERS = {
  'ML/AI': ['Python', 'PyTorch', 'TensorFlow', 'scikit-learn', 'HuggingFace', 'LangChain', 'RAG', 'LLM Fine-tuning', 'OpenAI API', 'Transformers', 'OpenCV'],
  Web: ['React', 'Next.js', 'Node.js', 'Express', 'TypeScript', 'Tailwind CSS', 'PostgreSQL', 'MongoDB', 'Vite', 'tRPC'],
  Backend: ['FastAPI', 'Django', 'Flask', 'Go', 'Java Spring', 'Redis', 'Docker', 'Kafka', 'GraphQL', 'gRPC'],
  Mobile: ['Flutter', 'React Native', 'Kotlin', 'Swift', 'Jetpack Compose', 'Firebase'],
  Data: ['Pandas', 'SQL', 'Spark', 'Airflow', 'Tableau', 'dbt', 'DuckDB', 'NumPy'],
  Web3: ['Solidity', 'Hardhat', 'ethers.js', 'IPFS', 'The Graph', 'Foundry'],
  Graph: ['Neo4j', 'Cypher', 'NetworkX', 'Knowledge Graphs', 'Vector Databases', 'Pinecone', 'Qdrant'],
  DevOps: ['AWS', 'GCP', 'Kubernetes', 'Terraform', 'GitHub Actions', 'Nginx', 'Prometheus'],
  Design: ['Figma', 'UX Research', 'Framer', 'Prototyping', 'Design Systems', 'Motion Design'],
  IoT: ['Arduino', 'Raspberry Pi', 'ESP32', 'MQTT', 'Embedded C', 'LoRaWAN'],
};

/** Which clusters a role preference draws from, primary first. */
export const ROLE_TO_CLUSTERS = {
  Backend: ['Backend', 'Web', 'DevOps'],
  Frontend: ['Web', 'Design', 'Mobile'],
  'Full-stack': ['Web', 'Backend', 'DevOps'],
  'ML/AI': ['ML/AI', 'Data', 'Graph'],
  Data: ['Data', 'ML/AI', 'Backend'],
  Design: ['Design', 'Web'],
  Product: ['Design', 'Data', 'Web'],
  DevOps: ['DevOps', 'Backend', 'Graph'],
  Mobile: ['Mobile', 'Web', 'Backend'],
  Web3: ['Web3', 'Web', 'Backend'],
  'Hardware/IoT': ['IoT', 'Backend', 'Data'],
};

/** GitHub-reportable languages per cluster, for top_languages coherence. */
export const CLUSTER_LANGUAGES = {
  'ML/AI': ['Python', 'Jupyter Notebook', 'Python', 'C++'],
  Web: ['JavaScript', 'TypeScript', 'CSS', 'HTML'],
  Backend: ['Python', 'Go', 'Java', 'TypeScript'],
  Mobile: ['Dart', 'Kotlin', 'Swift', 'JavaScript'],
  Data: ['Python', 'Jupyter Notebook', 'R', 'SQL'],
  Web3: ['Solidity', 'TypeScript', 'JavaScript'],
  Graph: ['Python', 'Cypher', 'JavaScript'],
  DevOps: ['Go', 'Shell', 'HCL', 'Python'],
  Design: ['JavaScript', 'CSS', 'HTML', 'TypeScript'],
  IoT: ['C++', 'C', 'Python', 'Arduino'],
};

export const THEMES = [
  'GenAI & Agents', 'FinTech', 'HealthTech', 'Climate & Sustainability', 'EdTech',
  'Web3', 'Open Source & DevTools', 'Smart Cities & IoT', 'Social Impact', 'Data & Graph',
];

/** Theme -> the skill clusters a project on that theme actually uses. */
export const THEME_CLUSTERS = {
  'GenAI & Agents': ['ML/AI', 'Backend', 'Web', 'Graph'],
  FinTech: ['Backend', 'Web', 'Data'],
  HealthTech: ['ML/AI', 'Mobile', 'Backend'],
  'Climate & Sustainability': ['Data', 'IoT', 'Web'],
  EdTech: ['Web', 'ML/AI', 'Mobile'],
  Web3: ['Web3', 'Web', 'Backend'],
  'Open Source & DevTools': ['Backend', 'DevOps', 'Web'],
  'Smart Cities & IoT': ['IoT', 'Data', 'Backend'],
  'Social Impact': ['Web', 'Mobile', 'Data'],
  'Data & Graph': ['Graph', 'Data', 'Backend'],
};

/**
 * Concrete project seeds. Each carries a real problem and a real approach so the
 * generated description has something specific to say.
 */
export const PROJECT_SEEDS = {
  'GenAI & Agents': [
    { title: 'LegalRAG', problem: 'tenants signing rental agreements they have not read', approach: 'a retrieval-augmented assistant that answers questions about an uploaded contract and flags unusual clauses' },
    { title: 'StandupBot', problem: 'engineering managers losing half an hour a day to status meetings', approach: 'an agent that reads commit history and issue movement and drafts the standup summary' },
    { title: 'PaperTrail', problem: 'researchers drowning in preprints outside their niche', approach: 'a multi-agent reader that summarises new arXiv papers and traces how they cite each other' },
    { title: 'SupportSieve', problem: 'support teams answering the same ticket forty times a week', approach: 'a classifier plus draft-reply agent grounded in the existing resolved-ticket archive' },
    { title: 'MeetingMemory', problem: 'decisions made in calls and then forgotten a fortnight later', approach: 'transcription plus an extraction pass that turns decisions into a searchable timeline' },
    { title: 'PromptForge', problem: 'teams having no way to tell whether a prompt change made things worse', approach: 'a regression harness that scores prompt variants against a fixed evaluation set' },
    { title: 'CodeCartographer', problem: 'new joiners taking six weeks to understand an unfamiliar repository', approach: 'static analysis feeding an agent that answers architecture questions with file citations' },
    { title: 'GrantMatch', problem: 'small nonprofits missing funding calls they were eligible for', approach: 'semantic matching between an organisation profile and open grant listings' },
    { title: 'SchemaSage', problem: 'analysts unable to write SQL against a warehouse nobody documented', approach: 'schema-constrained text-to-SQL with a read-only execution guard' },
    { title: 'Interviewer', problem: 'students with no way to practise technical interviews out loud', approach: 'a voice agent that asks follow-ups and scores answers against a rubric' },
  ],
  FinTech: [
    { title: 'SplitFair', problem: 'flatmates arguing about shared expenses every month', approach: 'receipt OCR plus a settlement engine that minimises the number of transfers' },
    { title: 'SIPSense', problem: 'first-time investors picking funds on the basis of last year returns', approach: 'a risk-profiling questionnaire mapped onto historical drawdown data' },
    { title: 'FraudFence', problem: 'UPI fraud that clears before anyone reviews it', approach: 'a streaming anomaly detector scoring transactions against the sender behavioural baseline' },
    { title: 'CreditBridge', problem: 'gig workers with no formal credit history', approach: 'alternative scoring built from earnings regularity and platform ratings' },
    { title: 'TaxTrail', problem: 'freelancers reconstructing a year of expenses every March', approach: 'bank statement parsing with automatic category assignment and a quarterly estimate' },
    { title: 'InvoiceLoop', problem: 'small vendors chasing payment by phone for weeks', approach: 'invoice tracking with escalating automated reminders and a payment status API' },
    { title: 'RentRecord', problem: 'tenants unable to prove a rent payment history to a landlord', approach: 'a verifiable payment ledger with exportable proof of consistency' },
    { title: 'MicroHedge', problem: 'importers exposed to currency swings they cannot model', approach: 'a simplified hedging calculator with scenario comparison' },
  ],
  HealthTech: [
    { title: 'DoseDiary', problem: 'elderly patients on six medications missing doses', approach: 'a scheduling app with pill-image recognition and a caregiver escalation path' },
    { title: 'TriageTalk', problem: 'rural clinics with one doctor and a queue of ninety', approach: 'a symptom intake assistant that orders the queue by urgency' },
    { title: 'DermScan', problem: 'skin conditions ignored until they need hospitalisation', approach: 'an image classifier flagging lesions that warrant a referral, with explicit uncertainty' },
    { title: 'MindLog', problem: 'therapists with no visibility between fortnightly sessions', approach: 'a structured mood journal producing a clinician-readable trend report' },
    { title: 'BloodBridge', problem: 'blood banks and hospitals unable to see each other inventory', approach: 'a shared availability registry with expiry-aware matching' },
    { title: 'PhysioPose', problem: 'physiotherapy patients doing home exercises incorrectly', approach: 'pose estimation giving real-time form correction from a phone camera' },
    { title: 'ReportReader', problem: 'patients handed a lab report they cannot interpret', approach: 'extraction of values with plain-language explanation and out-of-range flagging' },
    { title: 'VaxTrack', problem: 'parents losing the paper immunisation card', approach: 'a digital schedule with reminders and a portable verifiable record' },
  ],
  'Climate & Sustainability': [
    { title: 'GridGaze', problem: 'housing societies unable to see which load is driving their bill', approach: 'non-intrusive load disaggregation from a single smart-meter feed' },
    { title: 'AirTrail', problem: 'commuters choosing routes without knowing what they are breathing', approach: 'a low-cost sensor mesh feeding a route-level exposure estimate' },
    { title: 'WasteWise', problem: 'municipal trucks running fixed routes past empty bins', approach: 'fill-level sensing with route optimisation against collection cost' },
    { title: 'SolarSight', problem: 'homeowners unable to estimate rooftop solar payback', approach: 'satellite roof segmentation combined with local irradiance and tariff data' },
    { title: 'CropCast', problem: 'smallholder farmers planting against the wrong forecast', approach: 'downscaled weather prediction delivered as a voice call in the local language' },
    { title: 'WaterWatch', problem: 'borewell depletion noticed only when the pump runs dry', approach: 'crowd-sourced water-level readings plotted against seasonal baselines' },
    { title: 'CarbonLedger', problem: 'small manufacturers asked for emissions data they do not collect', approach: 'invoice-derived scope-two estimation with an auditable calculation trail' },
  ],
  EdTech: [
    { title: 'DoubtDesk', problem: 'students stuck at midnight with nobody to ask', approach: 'a peer-routing queue that matches a question to whoever recently solved it' },
    { title: 'GradeGrain', problem: 'teachers spending weekends marking short-answer questions', approach: 'rubric-guided grading assistance with mandatory teacher confirmation' },
    { title: 'SyllabusSync', problem: 'students discovering a deadline the night before', approach: 'syllabus parsing into a shared calendar with workload forecasting' },
    { title: 'LabSim', problem: 'colleges without equipment for practical coursework', approach: 'browser-based circuit and chemistry simulation with guided experiments' },
    { title: 'ReadRight', problem: 'undiagnosed dyslexia in primary classrooms', approach: 'a reading-fluency screener producing a referral recommendation, not a diagnosis' },
    { title: 'SkillPath', problem: 'students with no idea which course actually leads anywhere', approach: 'mapping job postings back to prerequisite skills and available courses' },
    { title: 'AttendAR', problem: 'twenty minutes of every lecture lost to a roll call', approach: 'face-based attendance with an explicit opt-out and on-device processing' },
  ],
  Web3: [
    { title: 'DeedChain', problem: 'land record disputes that take a decade in court', approach: 'an append-only transfer registry with notarised document hashes' },
    { title: 'FanFund', problem: 'independent musicians with no route to patronage', approach: 'tokenised revenue sharing with automatic royalty splits' },
    { title: 'VoteProof', problem: 'student union elections nobody trusts', approach: 'anonymous verifiable ballots with a public tally anyone can recompute' },
    { title: 'SupplyStamp', problem: 'counterfeit pharmaceuticals in the distribution chain', approach: 'per-batch provenance anchored on-chain with a consumer scan check' },
    { title: 'DAOdesk', problem: 'DAO treasuries managed through spreadsheets and vibes', approach: 'proposal tracking with on-chain execution and a spending dashboard' },
    { title: 'CarbonCred', problem: 'carbon credits sold twice to different buyers', approach: 'retirement registry preventing double counting across marketplaces' },
  ],
  'Open Source & DevTools': [
    { title: 'FlakeFinder', problem: 'CI suites nobody trusts because a tenth of failures are noise', approach: 'historical run analysis isolating tests that fail non-deterministically' },
    { title: 'DepDrift', problem: 'dependency upgrades nobody dares to run', approach: 'changelog diffing plus blast-radius estimation from actual call sites' },
    { title: 'LogLens', problem: 'production incidents debugged by grepping twelve services', approach: 'trace-correlated log aggregation with anomaly highlighting' },
    { title: 'SecretSweep', problem: 'API keys committed and noticed six months later', approach: 'pre-commit entropy scanning with a rotation workflow' },
    { title: 'ReviewRadar', problem: 'pull requests sitting unreviewed for a week', approach: 'reviewer suggestion based on file ownership and recent context' },
    { title: 'MigrateMate', problem: 'database migrations that fail halfway on production', approach: 'dry-run simulation against a schema snapshot with rollback generation' },
    { title: 'DocDrift', problem: 'documentation that silently stops matching the code', approach: 'linking doc snippets to symbols and flagging drift on change' },
  ],
  'Smart Cities & IoT': [
    { title: 'PotholePatrol', problem: 'road defects reported only after they cause an accident', approach: 'accelerometer data from commuter phones mapped into a repair priority list' },
    { title: 'ParkPulse', problem: 'drivers circling for fifteen minutes to find a space', approach: 'camera-based occupancy detection with a live availability feed' },
    { title: 'FloodFore', problem: 'urban flooding with no warning at street level', approach: 'ultrasonic drain-level sensors feeding a ward-level alert' },
    { title: 'SignalSense', problem: 'fixed-timing traffic lights during unpredictable congestion', approach: 'queue-length estimation driving adaptive signal timing' },
    { title: 'StreetLightIQ', problem: 'streetlights burning at full power on empty roads', approach: 'motion-adaptive dimming with fault reporting per pole' },
    { title: 'NoiseMap', problem: 'noise complaints with no evidence behind them', approach: 'a distributed decibel sensor network producing time-of-day maps' },
  ],
  'Social Impact': [
    { title: 'ShelterFind', problem: 'night shelters with beds empty while people sleep outside', approach: 'live bed availability with an outreach-worker facing map' },
    { title: 'SkillSetu', problem: 'migrant workers unable to prove trade skills to a new employer', approach: 'a portable verified skill record backed by previous employer attestations' },
    { title: 'MealLink', problem: 'restaurant surplus discarded while shelters go short', approach: 'time-windowed surplus matching with pickup logistics' },
    { title: 'SignSpeak', problem: 'deaf users excluded from government service counters', approach: 'sign language recognition producing text for the counter operator' },
    { title: 'LegalAidLine', problem: 'undertrials unaware they qualify for free legal aid', approach: 'an eligibility checker in seven languages connected to aid clinics' },
    { title: 'SafeRoute', problem: 'women avoiding routes with no data on why they feel unsafe', approach: 'crowd-sourced safety scoring combined with lighting and footfall data' },
  ],
  'Data & Graph': [
    { title: 'AlumniAtlas', problem: 'universities with no picture of where their graduates ended up', approach: 'entity resolution across public profiles into a navigable alumni graph' },
    { title: 'ShellSeeker', problem: 'corporate ownership chains designed to be unreadable', approach: 'directorship graph traversal surfacing circular ownership' },
    { title: 'CiteWeb', problem: 'retracted papers still being cited years later', approach: 'citation graph propagation flagging downstream work built on retractions' },
    { title: 'SupplyGraph', problem: 'manufacturers unaware of a single point of failure two tiers down', approach: 'multi-tier supplier graph with concentration risk scoring' },
    { title: 'TalentGraph', problem: 'recruiters unable to find people by what they actually built', approach: 'a skill graph derived from project artefacts rather than self-reported tags' },
    { title: 'RouteKnot', problem: 'logistics planners optimising legs in isolation', approach: 'network-level route modelling exposing cross-route consolidation' },
  ],
};

/** Description sentence banks. {problem} {approach} {tech} {n} are substituted. */
export const DESC_PROBLEM = [
  'We started from a simple observation: {problem}.',
  'The team picked this up after running into {problem} first-hand.',
  '{problem} is the kind of problem everyone tolerates until it costs them something.',
  'Our entry addresses {problem}.',
  'The premise was that {problem} is a workflow problem, not a technology one.',
  'We spent the first two hours talking to people about {problem}.',
  'This project exists because of {problem}.',
  'A short survey of eleven users confirmed the core issue: {problem}.',
  'We wanted to attack {problem} without adding another dashboard nobody opens.',
  'The judging brief pushed us toward {problem}, which none of us had built for before.',
  'Everyone on the team had personally hit {problem}, which made scoping fast.',
  'What kept coming up in our research was {problem}.',
  'We framed the challenge narrowly: {problem}, for one specific user, end to end.',
  'The interesting part of {problem} is that the data usually already exists somewhere.',
  'Rather than a general platform, we targeted {problem} directly.',
  'Our mentor pushed us to justify why {problem} was worth solving; this is the result.',
  'Most existing tools in this space ignore {problem} entirely.',
  '{problem} turns out to be mostly an integration problem.',
  'We chose {problem} because it was small enough to finish and real enough to matter.',
  'The problem we scoped was {problem}.',
  'Two of us had worked on {problem} at internships and knew where it breaks.',
  'We kept the scope to {problem} rather than trying to build a platform.',
  'Our starting point was {problem}, deliberately narrow.',
  'Talking to the on-site mentors reframed {problem} for us halfway through.',
  'This addresses {problem}, which is worse than it sounds at scale.',
  'The team converged quickly on {problem} as the thing worth building.',
  'Behind {problem} is a data-access problem nobody owns.',
  'We treated {problem} as a latency problem rather than an accuracy one.',
];

export const DESC_APPROACH = [
  'Our solution is {approach}.',
  'We built {approach}.',
  'The system works by {approach}.',
  'Concretely: {approach}.',
  'The core of the build is {approach}.',
  'We shipped {approach}, with the rest stubbed.',
  'What we demoed was {approach}.',
  'The working prototype is {approach}.',
  'Our approach was {approach}, kept deliberately simple.',
  'We implemented {approach} and tested it against real inputs.',
  'The pipeline is {approach}.',
  'We settled on {approach} after discarding two heavier designs.',
  'The architecture is {approach}.',
  'At its core it is {approach}.',
  'We prototyped {approach} in the first four hours and spent the rest hardening it.',
  'The final build is {approach}, running end to end.',
  'Our design is {approach}, with a human confirmation step before anything is written.',
  'We ended up with {approach} after the first design proved too slow.',
  'The demo path is {approach}.',
  'The submission implements {approach}.',
  'We went with {approach} because it degraded gracefully when inputs were missing.',
  'The build is {approach}, with caching so the demo does not depend on the network.',
  'Functionally it is {approach}.',
  'We validated {approach} against a small hand-labelled set before building the UI.',
  'The mechanism is {approach}.',
  'Our implementation is {approach}, plus a thin review interface.',
];

export const DESC_TECH = [
  'Built with {tech}.',
  'Stack: {tech}.',
  'We used {tech}.',
  'Implemented in {tech}.',
  'The stack is {tech}, chosen for how fast we could iterate on it.',
  'Everything runs on {tech}.',
  'Technology-wise: {tech}.',
  'We leaned on {tech} to keep the build time down.',
  'Written using {tech}.',
  'The implementation uses {tech}.',
  'Tooling: {tech}.',
  'Put together with {tech}.',
  'We picked {tech} because the whole team already knew it.',
  'Runs on {tech}, deployed during the event.',
  'Built end to end with {tech}.',
  'Assembled from {tech}.',
  'The services are written in {tech}.',
  'We used {tech}, with no paid infrastructure.',
];

export const DESC_EXTRA = [
  'It is not production-ready: the error handling is thin and we skipped auth entirely.',
  'The biggest limitation is that it only handles the single-user case.',
  'We tested it on {n} real samples and it held up on all but two.',
  'Given more time the obvious next step is a proper evaluation set.',
  'We cut the mobile view to finish the core flow.',
  'The model is off-the-shelf; the interesting work is in the retrieval layer.',
  'Latency is the weak point, roughly four seconds on the heaviest path.',
  'We deliberately kept a human in the loop before anything is written back.',
  'What surprised us was how much of the difficulty was in cleaning the input.',
  'It works offline, which matters for the users we spoke to.',
  'We benchmarked against a naive baseline and beat it on most of our test cases.',
  'The dataset is small, so treat the accuracy number with suspicion.',
  'Two features in the pitch deck are not implemented and we said so on stage.',
  'We spent longer on the ingestion path than on the model, which was the right call.',
  'The UI is rough but every button does something real.',
  'One teammate dropped out on day two, so the scope is smaller than planned.',
  'We open-sourced it during the event; it has {n} stars so far.',
  'The fallback path matters more than the happy path here, so we built that first.',
];

/** Judge feedback banks, selected by score band. */
export const JUDGE_HIGH = [
  'Exceptionally well-scoped for the time available. The demo ran without a hitch and the team could answer every implementation question.',
  'Strongest submission in its track. Real technical depth and the presenters were honest about what was mocked.',
  'Clear problem, clear solution, working code. The evaluation numbers they showed were the differentiator.',
  'Polished end to end. Unusually good judgement about what to leave out.',
  'The architecture holds up to scrutiny and the team clearly built it themselves. Excellent.',
  'Genuinely useful beyond the hackathon. We would like to see this continued.',
  'Best use of the sponsor stack we saw all weekend, and the fallback design was thoughtful.',
  'Impressive breadth for a two-day build, with no hand-waving when questioned.',
  'Technically ambitious and it actually worked. The team handled the edge-case questions well.',
  'Outstanding execution. The provenance trail in particular showed real engineering maturity.',
];
export const JUDGE_MID = [
  'Solid execution on a familiar problem. The demo worked but the differentiation from existing tools was not argued clearly.',
  'Good technical foundation. The team ran out of time on the interface and it showed.',
  'Interesting approach, though the evaluation was thin. Some claims were not backed by what was demoed.',
  'Works as advertised. We would have liked more justification for the design choices.',
  'Competent build. The problem framing was stronger than the solution.',
  'Nice idea, partially delivered. Two of the four features in the pitch were not working.',
  'The core flow is convincing; the surrounding scaffolding is not yet there.',
  'Reasonable scope and an honest presentation. The technical risk was low.',
  'Good teamwork and a clean demo, but the underlying method is off-the-shelf.',
  'The prototype does what they said. Scaling it would need a different architecture and they know that.',
  'Sensible engineering, unremarkable ambition. A safe submission.',
  'The data work is better than the modelling here, which is unusual and worth noting.',
];
export const JUDGE_LOW = [
  'The idea has merit but very little was working at demo time. Focus on finishing one flow next time.',
  'Overscoped. Three services half-built instead of one complete path.',
  'The presentation described a product that the code does not implement yet.',
  'Team struggled with the integration and spent the demo debugging. Worth retrying with a smaller scope.',
  'Unclear problem statement and the solution did not obviously follow from it.',
  'Mostly configuration of existing tools with little original work.',
  'The demo failed twice. The underlying idea is reasonable and worth another attempt.',
  'Significant parts were hard-coded, which the team did not disclose until questioned.',
  'Good energy, insufficient planning. Nothing ran end to end.',
  'The technical approach was not justified and the results were not measured.',
];

export const MENTOR_NOTE_HIGH = [
  'Came in with the architecture already sketched and asked precise questions about {topic}. Needed almost no help.',
  'Debugged a {topic} issue on their own while we talked; I mostly confirmed the approach.',
  'Very strong on {topic}. I suggested they cut scope and they immediately agreed and did it.',
  'Asked the best question of the session, about failure modes in {topic}. Clear thinker.',
  'Already knew the tradeoffs in {topic}; we spent the time on presentation strategy instead.',
  'Excellent grasp of {topic}. I pointed them at one library and they had it integrated by the next check-in.',
  'Took feedback on {topic} without getting defensive and shipped the change within the hour.',
  'Confident on {topic} and good at explaining it to their own team, which matters more.',
];
export const MENTOR_NOTE_MID = [
  'Solid on {topic} but was heading toward an overcomplicated design. Suggested a simpler path.',
  'Understood {topic} conceptually, less sure how to implement it. Walked through a concrete example.',
  'Spent too long on {topic} polish when the core flow was still broken. Redirected them.',
  'Good progress on {topic}. Needs to test with real input sooner rather than later.',
  'Asked reasonable questions about {topic}. Some gaps in fundamentals but closing fast.',
  'Making steady progress. Advised them to cut two features and finish {topic} properly.',
  'Competent with {topic} once unblocked, but was stuck for a while before asking for help.',
  'Knows {topic} well enough; the bottleneck was team coordination, not skill.',
];
export const MENTOR_NOTE_LOW = [
  'Struggling with {topic} fundamentals. Recommended they drop it and use a managed alternative.',
  'Scope is unrealistic for the time left. Advised cutting to one working flow around {topic}.',
  'Had not started implementing when we met. Spent the session planning {topic} instead of reviewing.',
  'Copied a {topic} tutorial without understanding it and could not modify it. Worked through the basics.',
  'Team was not aligned on what they were building; {topic} was the symptom, not the cause.',
  'Needed a lot of hand-holding on {topic}. Willing to learn but out of their depth for this scope.',
];

export const INTERACTION_TEXT = {
  comment: [
    'Anyone else getting a 429 from the sponsor API? Third time in ten minutes.',
    'The wifi in hall B is unusable, switching to a hotspot if anyone wants to share.',
    'Finally got the deployment working. The build was failing because of a Node version mismatch.',
    'Great talk on vector databases, the part about hybrid retrieval was the useful bit.',
    'Our team is two people short, DM me if you want to join a GenAI track build.',
    'Shout-out to whoever left the HDMI adapter at table 14, you saved our demo.',
    'Reminder that the submission deadline is 6pm not 8pm, it changed on the Discord.',
    'The graph database workshop was much better than I expected, worth the hour.',
    'Does the sponsor prize require using their hosted version or is self-hosted fine?',
    'Coffee has run out on floor 2 for anyone planning their next hour around it.',
    'We pivoted at 3am and it was the right call, the first idea had no demo path.',
    'If anyone is stuck on CORS with the workshop template, the fix is in the pinned message.',
    'Judging felt fair this time, the rubric being published in advance helped a lot.',
    'Our demo broke live and we still placed, so do not panic if yours does.',
    'The mentor feedback on scoping was the single most useful thing this weekend.',
    'Anyone have a spare USB-C charger? Ours walked off.',
    'Really liked that the results were announced with the score breakdown.',
    'Third hackathon here and the organisation keeps getting better.',
  ],
  question: [
    'Is there a rate limit on the embeddings endpoint, and if so what is it?',
    'Can we use a pre-existing repo as a starting point or does everything have to be written here?',
    'What counts as "using" the sponsor tech for the prize track?',
    'Are teams allowed to be four people or is three the cap this time?',
    'How long do we get for the demo, including questions?',
    'Is the dataset they provided allowed to be augmented with external data?',
    'Does anyone know if the AuraDB free tier can handle a few hundred thousand nodes?',
    'What is the best way to handle auth for a demo that has to work offline?',
    'Do judges want to see the code or just the running product?',
    'Is there a template for the submission writeup anywhere?',
    'Can one person be on two teams for different tracks?',
    'What happens if our deployment goes down during judging?',
    'Is model fine-tuning allowed or is it inference only?',
    'Are we expected to present on the main stage or at our table?',
  ],
  answered_question: [
    'Yes, self-hosted counts for the prize track, it was confirmed on the Discord at 11am.',
    'The cap is four this time, it changed from last edition.',
    'Rate limit is 60 requests per minute per key. Batch your calls.',
    'You get three minutes plus two for questions. They are strict about it.',
    'Judges look at the running product first, code only if they have doubts.',
    'You can augment the dataset as long as you declare the extra sources.',
    'Free tier handles that node count fine, but create your indexes before bulk loading.',
    'Pre-existing repos are allowed if you declare them and the new work is clearly separable.',
    'If your deployment dies they will let you show a recording, but tell them beforehand.',
    'Fine-tuning is allowed. Two teams did it last year.',
    'The writeup template is linked in the pinned message on the announcements channel.',
    'For offline auth just stub it and say so, nobody marks you down for that.',
    'You can be on two teams but you can only win once, which they enforce.',
    'Use a hotspot for the demo, the venue wifi drops under load every year.',
  ],
  discord_message: [
    'pushing the fix now, pull before you touch the retrieval service',
    'anyone awake? stuck on a merge conflict in the schema file',
    'demo script is in the shared doc, please read it before we rehearse',
    'i am taking the ingestion path, you take the UI, lets not touch the same files',
    'going to sleep for 90 minutes, ping me if the build breaks',
    'the api key rotated, new one is in the env file on the shared drive',
    'we are cutting the matchmaking feature, no time',
    'found the bug, it was a timezone thing in the date parsing',
    'can someone take screenshots for the submission while i fix the deploy',
    'rehearsed twice, we are at 3:10 so we need to cut about twenty seconds',
    'moving our table to near the power outlets, we are at 22 now',
    'last commit before freeze, do not push anything after this',
  ],
};

export const MENTOR_TOPICS = ['retrieval quality', 'schema design', 'prompt structure', 'deployment', 'scope control', 'graph modelling', 'evaluation', 'state management', 'API design', 'demo narrative', 'data cleaning', 'caching strategy', 'error handling', 'model selection'];

export const HACKATHON_NAMES = [
  'Ignite Delhi Winter', 'CodeCapital', 'BuildDelhi', 'HackFrontier', 'Yamuna Build Fest',
  'Ignite Delhi Spring', 'DevDelta', 'NorthStar Hacks', 'Capital Code Jam', 'Ignite Delhi Monsoon',
  'StackSprint', 'HackTheCapital', 'Ignite Delhi Autumn', 'ProtoDelhi', 'CircuitBreak',
  'Ignite Delhi Winter II', 'DeltaBuild', 'HackYamuna', 'Ignite Delhi Spring II', 'MetroHacks',
  'ForgeDelhi', 'Ignite Delhi Monsoon II', 'HackHorizon', 'Ignite Delhi Grand Finale',
];

export const TEAM_NAME_A = ['Silent', 'Rogue', 'Quantum', 'Midnight', 'Crimson', 'Iron', 'Neon', 'Stray', 'Velvet', 'Granite', 'Copper', 'Hollow', 'Rapid', 'Lucid', 'Feral', 'Amber', 'Obsidian', 'Paper', 'Static', 'Cobalt', 'Wandering', 'Brass', 'Frantic', 'Polar', 'Humble'];
export const TEAM_NAME_B = ['Compilers', 'Pointers', 'Daemons', 'Segfaults', 'Kernels', 'Sockets', 'Tensors', 'Vectors', 'Threads', 'Pipelines', 'Monoliths', 'Callbacks', 'Buffers', 'Mutexes', 'Cursors', 'Lambdas', 'Runtimes', 'Heaps', 'Registers', 'Cascades', 'Gradients', 'Payloads', 'Shards', 'Beacons', 'Anchors'];

export const COMPANIES = ['Razorpay', 'Zomato', 'Swiggy', 'Flipkart', 'Paytm', 'CRED', 'Zerodha', 'Postman', 'Freshworks', 'Zoho', 'InMobi', 'Meesho', 'Groww', 'PhonePe', 'Dream11', 'Urban Company', 'BrowserStack', 'Hasura', 'Chargebee', 'Sprinklr', 'Atlan', 'Locus', 'Delhivery', 'Jupiter', 'Slice'];

export const MENTOR_EXPERTISE = ['Machine Learning', 'Distributed Systems', 'Product Design', 'Data Engineering', 'Frontend Architecture', 'Security', 'Cloud Infrastructure', 'Mobile Engineering', 'Graph Databases', 'Developer Experience', 'Applied NLP', 'Payments Infrastructure', 'Computer Vision', 'Site Reliability', 'Growth Engineering'];

export const SPONSORS = ['Razorpay', 'Postman', 'GitHub', 'DigitalOcean', 'MongoDB', 'Vercel', 'Google Cloud', 'AWS', 'Polygon', 'Notion'];
export const FINAL_SPONSORS = ['Tavily', 'Cognee', 'Neo4j'];

export const CAMPAIGNS = [
  'winter-edition-invite', 'spring-edition-invite', 'monsoon-edition-invite', 'autumn-edition-invite',
  'alumni-winback', 'mentor-recruitment', 'workshop-announcement', 'grand-finale-invite',
  'track-specific-genai', 'track-specific-web3', 'feedback-request', 'community-digest',
];

export const REPO_TOPICS = {
  'ML/AI': ['machine-learning', 'pytorch', 'llm', 'rag', 'nlp', 'deep-learning', 'transformers'],
  Web: ['react', 'nextjs', 'typescript', 'tailwindcss', 'fullstack', 'vite'],
  Backend: ['fastapi', 'microservices', 'rest-api', 'docker', 'golang', 'redis'],
  Mobile: ['flutter', 'react-native', 'android', 'ios', 'mobile-app'],
  Data: ['data-engineering', 'pandas', 'analytics', 'etl', 'sql'],
  Web3: ['solidity', 'ethereum', 'smart-contracts', 'defi', 'web3'],
  Graph: ['neo4j', 'knowledge-graph', 'graph-database', 'cypher', 'vector-search'],
  DevOps: ['kubernetes', 'terraform', 'ci-cd', 'devops', 'aws'],
  Design: ['design-system', 'figma', 'ui-components', 'accessibility'],
  IoT: ['arduino', 'esp32', 'iot', 'embedded', 'raspberry-pi'],
};

export const REPO_NAME_A = ['swift', 'nano', 'open', 'mini', 'auto', 'smart', 'quick', 'deep', 'lite', 'hyper', 'proto', 'core'];
export const REPO_NAME_B = ['parser', 'tracker', 'engine', 'toolkit', 'bench', 'router', 'sync', 'lens', 'forge', 'kit', 'stream', 'index'];
