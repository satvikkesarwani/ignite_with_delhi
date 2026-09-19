import csv
import random
import os

# Real Indian First Names partitioned by Gender
MALE_NAMES = [
    "Aarav", "Vihaan", "Vivaan", "Advik", "Kabir", "Aryan", "Reyansh", "Ishaan",
    "Dhruv", "Aditya", "Rohan", "Atharv", "Siddharth", "Pranav", "Arjun", "Kunal",
    "Yash", "Dev", "Aman", "Tushar", "Saurabh", "Ayush", "Alok", "Nikhil",
    "Sarthak", "Satvik", "Priyanshu", "Harsh", "Tanmay", "Akash", "Utkarsh", "Varun",
    "Abhinav", "Madhav", "Karthik", "Gautam", "Manish", "Rishi", "Mayank", "Shivam",
    "Chirag", "Rishabh", "Shubham", "Aniket", "Jayesh", "Deepak", "Sameer", "Tejas",
    "Harshit", "Raghav", "Sujay", "Lakshya", "Anmol", "Aayush", "Bhavin", "Chaitanya"
]

FEMALE_NAMES = [
    "Ananya", "Diya", "Aanya", "Aadhya", "Saanvi", "Ira", "Myra", "Anushka",
    "Avani", "Ishita", "Riya", "Sneha", "Tanvi", "Shreya", "Meera", "Pooja",
    "Neha", "Kavya", "Aditi", "Anjali", "Pari", "Simran", "Shruti", "Swati",
    "Nandini", "Disha", "Sakshi", "Bhavya", "Divya", "Ritika", "Akanksha", "Mansi",
    "Prerna", "Komal", "Palak", "Khushi", "Vidhi", "Archana", "Radhika", "Deepika",
    "Mallika", "Muskan", "Aashna", "Garima", "Ishani", "Kashish", "Lavanya", "Tarini"
]

LAST_NAMES = [
    # North
    "Sharma", "Verma", "Gupta", "Malhotra", "Kapoor", "Chopra", "Bhatia", "Bansal", "Aggarwal", "Mittal",
    "Singhal", "Goyal", "Bhardwaj", "Pandey", "Mishra", "Trivedi", "Shukla", "Saxena", "Srivastava", "Mathur",
    # South
    "Iyer", "Iyengar", "Nair", "Menon", "Pillai", "Reddy", "Rao", "Naidu", "Murthy", "Krishnan",
    "Subramanian", "Swaminathan", "Venkatesh", "Balaji", "Sundaram", "Natarajan", "Gopal", "Shetty", "Hegde", "Bhat",
    # West
    "Patel", "Shah", "Mehta", "Deshmukh", "Joshi", "Kulkarni", "Patil", "Pawar", "Shinde", "Chavan",
    "More", "Sawant", "Jadhav", "Gaikwad", "Solanki", "Chauhan", "Modi", "Doshi", "Parikh", "Zaveri",
    # East
    "Mukherjee", "Banerjee", "Chatterjee", "Bhattacharya", "Dey", "Ghosh", "Saha", "Bose", "Sen", "Das",
    "Roy", "Chakraborty", "Barman", "Dutta", "Nath", "Choudhury", "Boro", "Saikia", "Gogoi", "Kalita"
]

# Colleges with state, city, domain, and gender rule (IGDTUW is women-only)
COLLEGES = [
    {"name": "Delhi Technological University (DTU)", "city": "New Delhi, Delhi", "domain": "dtu.ac.in", "women_only": False},
    {"name": "Netaji Subhas University of Technology (NSUT)", "city": "New Delhi, Delhi", "domain": "nsut.ac.in", "women_only": False},
    {"name": "Indian Institute of Technology Delhi (IIT Delhi)", "city": "New Delhi, Delhi", "domain": "iitd.ac.in", "women_only": False},
    {"name": "Indraprastha Institute of Information Technology Delhi (IIIT-Delhi)", "city": "New Delhi, Delhi", "domain": "iiitd.ac.in", "women_only": False},
    {"name": "Indira Gandhi Delhi Technical University for Women (IGDTUW)", "city": "New Delhi, Delhi", "domain": "igdtuw.ac.in", "women_only": True},
    {"name": "BITS Pilani (Pilani Campus)", "city": "Pilani, Rajasthan", "domain": "pilani.bits-pilani.ac.in", "women_only": False},
    {"name": "Indian Institute of Technology Bombay (IIT Bombay)", "city": "Mumbai, Maharashtra", "domain": "iitb.ac.in", "women_only": False},
    {"name": "Indian Institute of Technology Madras (IIT Madras)", "city": "Chennai, Tamil Nadu", "domain": "iitm.ac.in", "women_only": False},
    {"name": "Indian Institute of Technology Roorkee (IIT Roorkee)", "city": "Roorkee, Uttarakhand", "domain": "iitr.ac.in", "women_only": False},
    {"name": "Indian Institute of Technology Kharagpur (IIT KGP)", "city": "Kharagpur, West Bengal", "domain": "iitkgp.ac.in", "women_only": False},
    {"name": "National Institute of Technology Trichy (NIT Trichy)", "city": "Tiruchirappalli, Tamil Nadu", "domain": "nitt.edu", "women_only": False},
    {"name": "National Institute of Technology Surathkal (NITK)", "city": "Mangalore, Karnataka", "domain": "nitk.edu.in", "women_only": False},
    {"name": "Vellore Institute of Technology (VIT)", "city": "Vellore, Tamil Nadu", "domain": "vitstudent.ac.in", "women_only": False},
    {"name": "Manipal Institute of Technology (MIT)", "city": "Manipal, Karnataka", "domain": "learner.manipal.edu", "women_only": False},
    {"name": "Thapar Institute of Engineering and Technology", "city": "Patiala, Punjab", "domain": "thapar.edu", "women_only": False},
    {"name": "PES University (RR Campus)", "city": "Bengaluru, Karnataka", "domain": "pesu.pes.edu", "women_only": False},
    {"name": "RV College of Engineering (RVCE)", "city": "Bengaluru, Karnataka", "domain": "rvce.edu.in", "women_only": False},
    {"name": "Jamia Millia Islamia (Faculty of Engineering)", "city": "New Delhi, Delhi", "domain": "jmi.ac.in", "women_only": False},
    {"name": "SRM Institute of Science and Technology", "city": "Chennai, Tamil Nadu", "domain": "srmist.edu.in", "women_only": False},
    {"name": "Cluster Innovation Centre, University of Delhi (DU-CIC)", "city": "New Delhi, Delhi", "domain": "cic.du.ac.in", "women_only": False}
]

DEGREES = [
    "B.Tech Computer Science and Engineering",
    "B.Tech Information Technology",
    "B.Tech Artificial Intelligence and Data Science",
    "B.Tech Mathematics and Computing",
    "B.Tech Software Engineering",
    "B.Tech Electronics and Communication Engineering",
    "Integrated Dual Degree (B.Tech + M.Tech) Computer Science"
]

TRACKS_CONFIG = {
    "AI/ML & Generative AI": {
        "roles": ["AI Research & Model Tuning Specialist", "LLM Applications Engineer", "MLOps Pipeline Lead"],
        "core_skills": ["Python", "PyTorch", "FastAPI", "HuggingFace Transformers", "LangChain", "OpenAI / Claude API", "FastEmbed", "Neo4j GraphRAG"],
        "secondary_skills": ["Scikit-Learn", "Vector Databases (Milvus/LanceDB)", "TensorFlow", "Docker", "ONNX Runtime", "Pandas", "CUDA", "vLLM"],
        "project_templates": [
            ("NeoGraphRAG - Multi-hop Knowledge Graph Reasoner", "PyTorch, Neo4j, FastEmbed, FastAPI", "Constructs semantic graphs from messy documents and executes multi-hop vector+Cypher GraphRAG with 94% factual grounding."),
            ("DocuSense - Privacy-Preserving Legal LLM", "LangChain, LLaMA-3, ChromaDB, FastAPI", "Offline quantized LLM for automated NDA clause extraction and compliance auditing with sub-second retrieval."),
            ("VoiceAgent - Real-time Low Latency Conversational AI", "FastAPI, Whisper, Deepgram, WebSockets, Python", "Full-duplex conversational voice agent with audio streaming and 380ms response latency for medical intake."),
            ("VisionPulse - Edge Detection for Industrial Safety", "PyTorch, YOLOv8, OpenCV, Docker, FastAPI", "Real-time edge computer vision model identifying factory safety violations with 96.2% mAP running at 30 FPS.")
        ]
    },
    "Full Stack Web Systems": {
        "roles": ["Full Stack Lead & System Architect", "Backend Systems Specialist", "Frontend UI/UX & State Architect"],
        "core_skills": ["React 18", "Next.js 14 (App Router)", "TypeScript", "Node.js", "Express.js", "PostgreSQL", "Tailwind CSS"],
        "secondary_skills": ["Redis Caching", "Prisma ORM", "GraphQL", "WebSockets", "Docker", "Supabase", "AWS S3", "TRPC", "Turborepo"],
        "project_templates": [
            ("CollabCanvas - Real-time Distributed Whiteboard", "Next.js 14, TypeScript, WebSockets, Redis, Canvas API", "Infinite collaborative canvas supporting 50+ concurrent users with operational transformation and CRDT sync."),
            ("PayFlow - Fault-tolerant Payment Orchestrator", "Node.js, Express, PostgreSQL, Redis, Stripe/Razorpay Webhooks", "Idempotent payment pipeline handling 2,500 req/sec with automatic dead-letter queue recovery and reconciliation."),
            ("PulseDesk - Developer Experience Ticketing CRM", "React, TypeScript, GraphQL, PostgreSQL, TailwindCSS", "High-throughput issue tracker with keyboard-first shortcuts, optimistic updates, and instant full-text search."),
            ("StreamLine - Video Asset Transcoding Platform", "Next.js, Node.js, FFmpeg, AWS S3, BullMQ, Redis", "Serverless distributed video processing queue transcoding 4K footage into adaptive HLS streams in parallel.")
        ]
    },
    "Web3 & Decentralized Protocols": {
        "roles": ["Smart Contract Architect", "Protocol & DeFi Engineer", "Full Stack Web3 Builder"],
        "core_skills": ["Solidity", "Ethereum", "Hardhat", "Foundry", "Ethers.js", "Web3.js", "Next.js"],
        "secondary_skills": ["Polygon", "IPFS", "Chainlink Oracles", "The Graph Protocol", "Zero Knowledge Proofs (Circom)", "Metamask SDK", "Rust"],
        "project_templates": [
            ("CrossBridge - Omnichain Liquidity Router", "Solidity, Foundry, LayerZero, Next.js, Ethers.js", "Zero-slippage cross-chain asset bridge securing $150K testnet volume with automated rebalancing vaults."),
            ("zkVerify - Anonymous Academic Credential Attestation", "Solidity, Circom, SnarkJS, IPFS, Next.js", "Zero-knowledge proof verification allowing students to prove degrees and GPA thresholds without revealing identity."),
            ("FairAuction - MEV-Resistant Batch Auctioneer", "Solidity, Hardhat, Chainlink VRF, Ethers.js", "Blind batch Dutch auction smart contract preventing front-running and sandwich attacks on DEX listings."),
            ("DAOStream - Real-time Governance Treasury Manager", "Solidity, Gnosis Safe, The Graph, React, Web3.js", "Multi-sig automated streaming salary protocol with quadratic voting mechanisms for Web3 contributor collectives.")
        ]
    },
    "Cloud Infrastructure & DevOps": {
        "roles": ["Cloud Infrastructure Lead", "Site Reliability Engineer (SRE)", "Platform & Containerization Specialist"],
        "core_skills": ["Docker", "Kubernetes", "Linux (Ubuntu/Debian)", "AWS (EC2/S3/EKS)", "Terraform", "CI/CD (GitHub Actions)"],
        "secondary_skills": ["Go", "Python", "Prometheus & Grafana", "ArgoCD", "Nginx", "Helm Charts", "Bash Scripting", "PostgreSQL Administration"],
        "project_templates": [
            ("KubeAutoScaler - Predictive Resource Provisioner", "Go, Kubernetes Client-Go, Prometheus API, Docker", "Custom Kubernetes operator predicting traffic spikes via ARIMA and scaling microservices 3 minutes ahead of load."),
            ("InfraForge - Multi-Cloud Terraform Blueprints", "Terraform, AWS, GCP, GitHub Actions, Terragrunt", "Modular infrastructure-as-code deploying production-grade VPCs, private EKS clusters, and RDS with zero manual clicks."),
            ("LogWatch - Distributed Observability Pipeline", "Go, OpenTelemetry, Grafana Loki, Docker, Nginx", "Lightweight log aggregation agent parsing 10,000 logs/sec with 4x lower memory footprint than Fluentbit."),
            ("ChaosMesh - Automated Fault-Injection Simulator", "Python, Docker, Bash, Linux cgroups, Kubernetes", "Automated chaos engineering test suite simulating network latency, pod kill, and memory spikes in staging environments.")
        ]
    },
    "Mobile & Edge Computing": {
        "roles": ["Cross-Platform Mobile Lead", "Android Native Engineer", "Mobile Systems & Offline-First Architect"],
        "core_skills": ["Flutter", "Dart", "React Native", "Android (Kotlin)", "RESTful APIs", "State Management (Bloc/Riverpod)"],
        "secondary_skills": ["Firebase (Auth/Firestore)", "SQLite / Drift", "Push Notifications (FCM)", "iOS (Swift)", "Mobile Security", "Tailwind Mobile"],
        "project_templates": [
            ("OffGridSOS - Mesh Network Emergency Communicator", "Flutter, Dart, Bluetooth Low Energy (BLE), SQLite", "Offline-first disaster communication app relaying emergency pings peer-to-peer over BLE without internet."),
            ("FitTrack AI - On-Device Workout Form Corrector", "React Native, TensorFlow Lite, MediaPipe, TypeScript", "Edge AI fitness tracker detecting posture angles and counting reps with real-time audio guidance at 60 FPS."),
            ("AgriSense - Smart Crop Disease Diagnostic App", "Flutter, Dart, TFLite, CameraX, Firebase", "Offline camera scanner diagnosing 38 plant diseases in rural areas with local neural network execution in 180ms."),
            ("PayQuick - Contactless QR Soundwave Payment Terminal", "Android (Kotlin), Audio Synthesis, AES-256, SQLite", "Ultra-fast merchant payment app confirming micro-transactions via encrypted sonic frequencies without NFC.")
        ]
    },
    "Cybersecurity & System Defense": {
        "roles": ["Application Security Specialist", "Penetration Tester & Ethical Hacker", "Security Operations Engineer"],
        "core_skills": ["Python", "Network Security", "Linux Hardening", "Penetration Testing (Burp Suite/OWASP)", "Wireshark", "Bash Scripting"],
        "secondary_skills": ["Cryptography (RSA/ECC)", "Docker Security", "Reverse Engineering (Ghidra)", "Metasploit", "SIEM (Elastic Security)", "Snort IDS"],
        "project_templates": [
            ("VulnScanner - Automated CI/CD Dependency Auditor", "Python, Docker, Semgrep API, GitHub Actions", "Static application security testing (SAST) tool scanning commits for secret leaks and CVE vulnerabilities in under 12 seconds."),
            ("NetShield - Machine Learning Network Intrusion Detector", "Python, Scikit-Learn, Scapy, Wireshark, SQLite", "Real-time packet inspection daemon flagging port scans, SYN floods, and DNS tunneling with 98.4% anomaly precision."),
            ("HoneyNode - Deceptive Cloud Honeypot Fleet", "Go, Docker, Linux iptables, AWS, Elasticsearch", "Low-interaction cloud honeypot capturing SSH brute-force patterns and attacker IP fingerprints for threat intelligence."),
            ("AuthVault - Hardware Token Multi-Factor Authenticator", "Python, Cryptography, FIDO2 / WebAuthn, SQLite", "Enterprise zero-trust authentication server enforcing biometric WebAuthn security keys and biometric tokens.")
        ]
    }
}

COMPANIES = [
    {"name": "Swiggy", "tier": "Unicorn", "team": "Consumer App / Logistics Delivery"},
    {"name": "Zomato", "tier": "Public Tech", "team": "Blinkit Quick Commerce Platform"},
    {"name": "Razorpay", "tier": "FinTech Unicorn", "team": "Core Payments & Merchant API"},
    {"name": "Zepto", "tier": "Quick Commerce Unicorn", "team": "Dark Store Fulfillment Systems"},
    {"name": "Cred", "tier": "FinTech Unicorn", "team": "Rewards & High-Concurrency Ledger"},
    {"name": "Postman", "tier": "API Platform Unicorn", "team": "API Client & Collaboration Engine"},
    {"name": "Flipkart", "tier": "E-Commerce Giant", "team": "Search & Recommendations Engine"},
    {"name": "PhonePe", "tier": "Payments Giant", "team": "UPI High-Throughput Gateway"},
    {"name": "BrowserStack", "tier": "DevTools Unicorn", "team": "Real Device Cloud Infrastructure"},
    {"name": "Microsoft India (R&D)", "tier": "Big Tech", "team": "Azure Core Systems / Teams Platform"},
    {"name": "Cisco India", "tier": "Enterprise Networking", "team": "Cloud Security & Threat Defense"},
    {"name": "Amazon India", "tier": "Big Tech", "team": "AWS S3 / Prime Video Infrastructure"},
    {"name": "Polygon Labs", "tier": "Web3 Protocol", "team": "Zero-Knowledge Rollup Research"},
    {"name": "Groww", "tier": "FinTech Unicorn", "team": "Stocks & Trading Engine Backend"},
    {"name": "Urban Company", "tier": "Service Unicorn", "team": "Partner Dispatch Algorithm Team"},
    {"name": "Google Summer of Code (GSoC)", "tier": "Prestigious Open Source", "team": "Core Contributor Fellowship"},
    {"name": "MLH Fellowship (Major League Hacking)", "tier": "Global Fellowship", "team": "Open Source Engineering Track"},
    {"name": "LFX Mentorship (Linux Foundation)", "tier": "Global Open Source", "team": "Cloud Native Computing Foundation (CNCF)"}
]

INTERNSHIP_IMPACTS = [
    "Engineered asynchronous queue consumer with BullMQ and Redis, slashing API timeout rates by 68%.",
    "Optimized SQL query performance across 40M+ rows in PostgreSQL, reducing p99 latency from 1.4s to 120ms.",
    "Built microservice in Go and gRPC handling 15,000 RPM with 99.99% uptime during peak flash sale traffic.",
    "Fine-tuned quantized LLM pipeline using LoRA, achieving 93% accuracy on domain entity extraction.",
    "Architected automated CI/CD staging pipeline reducing deployment rollback cycle from 45 min to 4 min.",
    "Implemented client-side caching and code-splitting in React/Next.js, boosting Lighthouse performance from 54 to 96.",
    "Integrated distributed tracing with OpenTelemetry and Jaeger, enabling instant identification of cross-service bottlenecks.",
    "Developed smart contract security tests using Foundry, catching 3 high-severity reentrancy edge cases before audit."
]

HACKATHON_WINS = [
    # Top Tier Prestigious Wins (30%)
    ("Smart India Hackathon (SIH 2023) - 1st Prize Winner (₹1,00,000)", "Smart India Hackathon, Govt of India"),
    ("ETHIndia 2023 - Best DeFi Hack ($3,000 Winner)", "ETHIndia / Devfolio"),
    ("HackDelphi 2024 - Overall 1st Place Champion", "HackDelphi Delhi"),
    ("HackCBS 6.0 - Best AI/ML Implementation Winner", "HackCBS (Asia's Largest Student Hackathon)"),
    ("HackThisFall 2024 - 1st Place Track Winner", "HackThisFall"),
    ("Google Solution Challenge 2024 - Global Top 100", "Google Developer Student Clubs"),
    ("Flipkart GRiD 5.0 - National Finalist (Top 10)", "Flipkart"),
    ("TCS CodeVita Season XI - Global Rank #142", "Tata Consultancy Services"),
    ("MLH Hackathon - Best Innovation & Hardware Integration", "Major League Hacking"),
    ("InOut 2023 - Best Community Choice Award", "InOut Hackathon"),
    # Finalists & Runners Up (40%)
    ("Smart India Hackathon (SIH) - 1st Runner Up", "Smart India Hackathon"),
    ("ETHIndia 2023 - Pool Prize Winner ($1,000)", "ETHIndia"),
    ("HackCBS 6.0 - Finalist (Top 8 Teams)", "HackCBS"),
    ("HackDTU 5.0 - Best Use of Neo4j / Graph Database", "DTU Hackathon"),
    ("HackNSUT 2024 - 2nd Runner Up (Web3 Track)", "NSUT Hackathon"),
    ("IIITD HackSprint - 1st Runner Up (Open Innovation)", "IIIT-Delhi"),
    # General Participants (30%)
    ("Finalist & Track Participant", "Devfolio Community Hackathon"),
    ("Active Participant & Contributor", "Campus Tech Fest Hackathon"),
    ("Participant", "Local Collegiate Hackathon")
]

PAST_HACKATHON_NAMES = [
    "Smart India Hackathon (SIH)", "ETHIndia", "HackCBS", "HackDelphi", "HackThisFall",
    "HackDTU", "HackNSUT", "HackIIITD", "Flipkart GRiD", "MLH Local Hack Day", "InOut Hackathon", "CodeKshetra"
]

def generate_student(idx):
    college_data = random.choice(COLLEGES)
    college = college_data["name"]
    city = college_data["city"]
    
    # Strictly respect gender rules (e.g. IGDTUW is an all-women university)
    if college_data["women_only"]:
        gender = "Female"
        first = random.choice(FEMALE_NAMES)
    else:
        gender = random.choice(["Male", "Female"])
        first = random.choice(MALE_NAMES if gender == "Male" else FEMALE_NAMES)
        
    last = random.choice(LAST_NAMES)
    name = f"{first} {last}"
    
    # Realistic email
    clean_first = first.lower()
    clean_last = last.lower()
    num = random.randint(1, 99)
    if random.random() < 0.75:
        email = f"{clean_first}.{clean_last}{num}@{college_data['domain']}"
    else:
        email = f"{clean_first}.{clean_last}.dev@gmail.com"
        
    phone = f"+91 {random.choice(['98', '99', '97', '96', '95', '93', '88', '87', '70'])}{random.randint(10000000, 99999999)}"
    degree = random.choice(DEGREES)
    cgpa = round(random.uniform(7.8, 9.8), 2)
    grad_year = random.choice([2025, 2026, 2027, 2028])
    
    # Pick track
    track = random.choice(list(TRACKS_CONFIG.keys()))
    t_cfg = TRACKS_CONFIG[track]
    role = random.choice(t_cfg["roles"])
    
    # Core & secondary skills
    chosen_core = random.sample(t_cfg["core_skills"], random.randint(4, min(6, len(t_cfg["core_skills"]))))
    chosen_sec = random.sample(t_cfg["secondary_skills"], random.randint(3, 4))
    all_skills_str = ", ".join(chosen_core)
    secondary_skills_str = ", ".join(chosen_sec)
    
    # Flagship project
    proj_tuple = random.choice(t_cfg["project_templates"])
    proj_title, proj_tech, proj_desc = proj_tuple
    
    # Internship / Experience details
    has_internship = random.random() < 0.80  # 80% have company or lab internship
    if has_internship:
        comp_obj = random.choice(COMPANIES)
        company = comp_obj["name"]
        intern_status = "Currently Interning" if grad_year in [2025, 2026] else "Completed 6-Month Co-op"
        intern_role = f"{role.split('&')[0].strip()} Intern"
        intern_impact = random.choice(INTERNSHIP_IMPACTS)
    else:
        company = "Autonomous / Open Source Contributor"
        intern_status = "Full-time Student Developer"
        intern_role = "Core Open Source Contributor"
        intern_impact = "Built and maintained multiple open-source repositories with 120+ active GitHub stars."
        
    # GitHub stats
    github_handle = f"{clean_first}-{clean_last}-{random.randint(10, 999)}"
    github_url = f"https://github.com/{github_handle}"
    github_repos = random.randint(12, 45)
    github_stars = random.randint(15, 240)
    top_repo = proj_title.split('-')[0].strip().lower().replace(" ", "-")
    linkedin_url = f"https://linkedin.com/in/{clean_first}-{clean_last}-{random.randint(100, 999)}"
    portfolio_url = f"https://{clean_first}{clean_last}.dev"
    
    # Hackathon history
    hackathons_count = random.randint(2, 8)
    attended_sample = random.sample(PAST_HACKATHON_NAMES, min(hackathons_count, random.randint(2, 4)))
    past_hackathons_str = ", ".join(attended_sample)
    honor_title, honor_org = random.choice(HACKATHON_WINS)
    
    # Lead scoring calculation (60 to 99)
    lead_score = 55
    if has_internship: lead_score += 18
    if "1st Prize" in honor_title or "Winner" in honor_title or "Top 10" in honor_title:
        lead_score += 15
    elif "Runner Up" in honor_title or "Finalist" in honor_title:
        lead_score += 10
    if cgpa >= 8.5: lead_score += 5
    if github_stars > 50: lead_score += 5
    lead_score += min(hackathons_count * 2, 8)
    lead_score = max(60, min(99, lead_score))
    
    crm_status = random.choice(["new", "new", "new", "invited", "contacted"])
    
    # High-density synthesized ContextProfile narrative (The PS-3 Context Layer core)
    short_college = college.split('(')[0].strip()
    if has_internship:
        synthesized_context = (
            f"{name} is a {grad_year} {degree.split()[0]} candidate at {short_college} ({cgpa} CGPA) currently working as {intern_role} at {company}. "
            f"Specializes in {chosen_core[0]} and {chosen_core[1]} with demonstrated impact: {intern_impact} "
            f"Seasoned hackathon competitor with {hackathons_count} hackathons ({honor_title}); ideal for high-complexity {track} tracks."
        )
    else:
        synthesized_context = (
            f"{name} is a high-potential {grad_year} engineer at {short_college} with deep focus in {track} ({cgpa} CGPA). "
            f"Flagship project '{proj_title}' built with {proj_tech} showcases strong systems execution: {proj_desc} "
            f"Active across {hackathons_count} hackathons ({honor_title}) and open source with {github_stars} GitHub stars."
        )
        
    tavily_web_presence = (
        f"Verified GitHub ({github_repos} repos, {github_stars} stars, top repo '{top_repo}'). "
        f"Active commits in past 90 days. Public portfolio verified at {portfolio_url}. Ranked competitive coder with active podium finishes."
    )

    return {
        "candidate_id": f"IND-2026-{idx:04d}",
        "name": name,
        "gender": gender,
        "email": email,
        "phone": phone,
        "college": college,
        "city_state": city,
        "degree": degree,
        "cgpa": f"{cgpa} / 10.0",
        "graduation_year": grad_year,
        "primary_track": track,
        "team_role": role,
        "core_skills": all_skills_str,
        "secondary_skills": secondary_skills_str,
        "current_company": company,
        "current_role": intern_role,
        "internship_status": intern_status,
        "internship_impact": intern_impact,
        "flagship_project_title": proj_title,
        "flagship_project_tech": proj_tech,
        "flagship_project_desc": proj_desc,
        "github_url": github_url,
        "github_repos_count": github_repos,
        "github_stars_count": github_stars,
        "top_github_repo": top_repo,
        "linkedin_url": linkedin_url,
        "portfolio_url": portfolio_url,
        "hackathons_attended_count": hackathons_count,
        "past_hackathons": past_hackathons_str,
        "hackathon_podium_win": honor_title,
        "tavily_web_presence": tavily_web_presence,
        "lead_score": lead_score,
        "crm_status": crm_status,
        "synthesized_context_profile": synthesized_context
    }

def main():
    os.makedirs("data", exist_ok=True)
    out_path = "data/indian_students_1000.csv"
    fieldnames = [
        "candidate_id", "name", "gender", "email", "phone", "college", "city_state",
        "degree", "cgpa", "graduation_year", "primary_track", "team_role",
        "core_skills", "secondary_skills", "current_company", "current_role",
        "internship_status", "internship_impact", "flagship_project_title",
        "flagship_project_tech", "flagship_project_desc", "github_url",
        "github_repos_count", "github_stars_count", "top_github_repo",
        "linkedin_url", "portfolio_url", "hackathons_attended_count",
        "past_hackathons", "hackathon_podium_win", "tavily_web_presence",
        "lead_score", "crm_status", "synthesized_context_profile"
    ]
    
    with open(out_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for i in range(1, 1001):
            writer.writerow(generate_student(i))
            
    print(f"Successfully generated ultra-rich 1000 Indian students dataset at: {out_path}")

if __name__ == "__main__":
    main()
