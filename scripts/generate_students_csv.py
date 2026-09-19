import csv
import random
import os

# Diverse Indian First Names (Male & Female)
FIRST_NAMES = [
    # Male
    "Aarav", "Vihaan", "Vivaan", "Ananya", "Diya", "Advik", "Kabir", "Aryan", "Reyansh", "Ishaan",
    "Dhruv", "Aditya", "Rohan", "Atharv", "Siddharth", "Pranav", "Arjun", "Kunal", "Yash", "Dev",
    "Aman", "Tushar", "Saurabh", "Ayush", "Alok", "Nikhil", "Sarthak", "Satvik", "Priyanshu", "Harsh",
    "Tanmay", "Akash", "Utkarsh", "Varun", "Abhinav", "Madhav", "Karthik", "Gautam", "Manish", "Rishi",
    "Mayank", "Shivam", "Chirag", "Rishabh", "Shubham", "Aniket", "Jayesh", "Deepak", "Sameer", "Tejas",
    # Female
    "Aanya", "Aadhya", "Saanvi", "Ira", "Myra", "Anushka", "Avani", "Ishita", "Riya", "Sneha",
    "Tanvi", "Shreya", "Meera", "Pooja", "Neha", "Kavya", "Aditi", "Anjali", "Pari", "Simran",
    "Shruti", "Swati", "Nandini", "Disha", "Sakshi", "Bhavya", "Divya", "Ritika", "Akanksha", "Mansi",
    "Prerna", "Komal", "Palak", "Khushi", "Vidhi", "Archana", "Radhika", "Deepika", "Mallika", "Muskan"
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

COLLEGES = [
    {"name": "Delhi Technological University (DTU)", "city": "Delhi", "domain": "dtu.ac.in"},
    {"name": "Netaji Subhas University of Technology (NSUT)", "city": "Delhi", "domain": "nsut.ac.in"},
    {"name": "Indian Institute of Technology Delhi (IIT Delhi)", "city": "Delhi", "domain": "iitd.ac.in"},
    {"name": "Indraprastha Institute of Information Technology Delhi (IIIT-Delhi)", "city": "Delhi", "domain": "iiitd.ac.in"},
    {"name": "Indira Gandhi Delhi Technical University for Women (IGDTUW)", "city": "Delhi", "domain": "igdtuw.ac.in"},
    {"name": "BITS Pilani", "city": "Pilani", "domain": "pilani.bits-pilani.ac.in"},
    {"name": "Indian Institute of Technology Bombay (IIT Bombay)", "city": "Mumbai", "domain": "iitb.ac.in"},
    {"name": "Indian Institute of Technology Madras (IIT Madras)", "city": "Chennai", "domain": "iitm.ac.in"},
    {"name": "Indian Institute of Technology Roorkee (IIT Roorkee)", "city": "Roorkee", "domain": "iitr.ac.in"},
    {"name": "Indian Institute of Technology Kharagpur (IIT KGP)", "city": "Kharagpur", "domain": "iitkgp.ac.in"},
    {"name": "National Institute of Technology Trichy (NIT Trichy)", "city": "Tiruchirappalli", "domain": "nitt.edu"},
    {"name": "National Institute of Technology Surathkal (NITK)", "city": "Mangalore", "domain": "nitk.edu.in"},
    {"name": "Vellore Institute of Technology (VIT)", "city": "Vellore", "domain": "vitstudent.ac.in"},
    {"name": "Manipal Institute of Technology (MIT)", "city": "Manipal", "domain": "learner.manipal.edu"},
    {"name": "Thapar Institute of Engineering and Technology", "city": "Patiala", "domain": "thapar.edu"},
    {"name": "PES University", "city": "Bengaluru", "domain": "pesu.pes.edu"},
    {"name": "RV College of Engineering (RVCE)", "city": "Bengaluru", "domain": "rvce.edu.in"},
    {"name": "Jamia Millia Islamia (JMI)", "city": "Delhi", "domain": "jmi.ac.in"},
    {"name": "SRM Institute of Science and Technology", "city": "Chennai", "domain": "srmist.edu.in"},
    {"name": "University of Delhi (Cluster Innovation Centre)", "city": "Delhi", "domain": "cic.du.ac.in"}
]

DEGREES = [
    "B.Tech Computer Science and Engineering",
    "B.Tech Information Technology",
    "B.Tech Artificial Intelligence and Data Science",
    "B.Tech Electronics and Communication Engineering",
    "B.Tech Software Engineering",
    "B.Tech Mathematics and Computing",
    "Dual Degree (B.Tech + M.Tech) Computer Science"
]

TRACKS_AND_SKILLS = {
    "Full Stack Web": {
        "core": ["React", "Next.js", "Node.js", "TypeScript", "JavaScript", "Express.js"],
        "extra": ["Tailwind CSS", "PostgreSQL", "MongoDB", "Redis", "GraphQL", "Prisma", "Docker", "AWS S3", "WebSockets", "Supabase"]
    },
    "AI/ML & LLMs": {
        "core": ["Python", "PyTorch", "FastAPI", "HuggingFace", "LangChain", "OpenAI API"],
        "extra": ["Transformers", "Scikit-Learn", "Vector Databases", "Neo4j GraphRAG", "TensorFlow", "FastEmbed", "Docker", "Pandas", "NumPy", "ONNX"]
    },
    "Web3 & Blockchain": {
        "core": ["Solidity", "Ethereum", "Ethers.js", "Hardhat", "Smart Contracts", "Web3.js"],
        "extra": ["Rust", "Polygon", "IPFS", "Foundry", "The Graph", "Next.js", "MetaMask SDK", "Chainlink Oracles", "Zero Knowledge Proofs"]
    },
    "Cloud & DevOps": {
        "core": ["Docker", "Kubernetes", "Linux", "AWS", "CI/CD Pipelines", "Terraform"],
        "extra": ["GitHub Actions", "Prometheus", "Grafana", "Go", "Python", "Nginx", "PostgreSQL", "Bash Scripting", "ArgoCD", "Google Cloud"]
    },
    "Mobile Development": {
        "core": ["Flutter", "Dart", "React Native", "Android (Kotlin)", "REST APIs", "Mobile UI/UX"],
        "extra": ["Firebase", "SQLite", "State Management (Bloc/Riverpod)", "iOS (Swift)", "Push Notifications", "Tailwind Mobile", "Node.js"]
    },
    "Cyber Security": {
        "core": ["Network Security", "Penetration Testing", "Python", "Linux Hardening", "Wireshark", "Burp Suite"],
        "extra": ["Cryptography", "Web App Security (OWASP Top 10)", "Bash", "Reverse Engineering", "Docker Security", "SIEM Tools", "Metasploit"]
    }
}

COMPANIES = [
    "Swiggy", "Zomato", "Razorpay", "Zepto", "Cred", "Postman", "PhonePe", "Flipkart", "BrowserStack",
    "Microsoft India (Intern)", "Amazon India (Intern)", "Cisco India", "Groww", "Urban Company",
    "Meesho", "InMobi", "Jio Platforms", "Ather Energy", "CoinDCX", "Polygon Labs", "HackerRank",
    "Google Summer of Code (GSoC)", "LFX Mentorship Fellow", "MLH Fellowship", "Open Source Contributor",
    "College Research Lab", "Stealth AI Startup"
]

ROLES = [
    "Frontend Engineering Intern", "Backend Engineering Intern", "Full Stack Developer Intern",
    "AI/ML Research Intern", "Software Development Engineer (SDE) Intern", "DevOps & Cloud Intern",
    "Blockchain Developer Intern", "Mobile App Developer Intern", "Open Source Fellow",
    "Undergraduate Student Researcher"
]

HACKATHON_HONORS = [
    "None", "None", "None", "Finalist", "Finalist",
    "Smart India Hackathon (SIH) Winner",
    "Smart India Hackathon (SIH) 1st Runner Up",
    "ETHIndia Top 10 Finalist",
    "HackDelphi 1st Prize Winner",
    "HackCBS Best AI Project",
    "HackThisFall Track Winner",
    "MLH Hackathon Best Use of AI",
    "Flipkart GRiD Semi-Finalist",
    "Google Solution Challenge Top 100",
    "TCS CodeVita Top 500"
]

def generate_student(idx):
    gender = random.choice(["M", "F"])
    first = random.choice(FIRST_NAMES)
    last = random.choice(LAST_NAMES)
    name = f"{first} {last}"
    
    college_data = random.choice(COLLEGES)
    college = college_data["name"]
    city = college_data["city"]
    
    # 70% institutional email, 30% gmail
    clean_name = f"{first.lower()}.{last.lower()}{random.randint(1, 99)}"
    if random.random() < 0.7:
        email = f"{clean_name}@{college_data['domain']}"
    else:
        email = f"{clean_name}@gmail.com"
        
    phone = f"+91 {random.choice(['98', '99', '97', '96', '95', '93', '88', '87', '70'])}{random.randint(10000000, 99999999)}"
    grad_year = random.choice([2025, 2026, 2027, 2028])
    degree = random.choice(DEGREES)
    
    track = random.choice(list(TRACKS_AND_SKILLS.keys()))
    track_info = TRACKS_AND_SKILLS[track]
    
    # Pick 3-4 core skills + 2-3 extra skills
    selected_skills = random.sample(track_info["core"], random.randint(3, min(4, len(track_info["core"])))) + \
                      random.sample(track_info["extra"], random.randint(2, 3))
    skills_str = ", ".join(selected_skills)
    
    has_internship = random.random() < 0.75  # 75% have internship or research role
    if has_internship:
        company = random.choice(COMPANIES)
        role = random.choice(ROLES)
        internship_status = "Currently Interning"
    else:
        company = "None (Independent)"
        role = "Student Developer"
        internship_status = "Seeking Opportunities"
        
    github = f"https://github.com/{first.lower()}-{last.lower()}-{random.randint(10, 999)}"
    linkedin = f"https://linkedin.com/in/{first.lower()}-{last.lower()}-{random.randint(100, 999)}"
    
    hackathons_attended = random.randint(1, 8)
    honor = random.choice(HACKATHON_HONORS)
    
    # Lead scoring calculation (60 to 98)
    score = 60
    if has_internship:
        score += 15
    if honor != "None":
        score += 15
    if grad_year in [2025, 2026]:
        score += 5
    score += min(hackathons_attended * 2, 10)
    score += random.randint(-3, 3)
    lead_score = max(55, min(99, score))
    
    status = random.choice(["new", "new", "new", "invited", "contacted"])
    
    # Dynamic 2-sentence context summary
    if has_internship:
        context_summary = f"{grad_year} grad at {college.split('(')[0].strip()} working as {role} at {company}. Strong stack in {selected_skills[0]} and {selected_skills[1]} with {hackathons_attended} hackathons attended."
    else:
        context_summary = f"{grad_year} grad at {college.split('(')[0].strip()} with deep interest in {track}. Hands-on projects in {selected_skills[0]} and {selected_skills[1]}, highly active across open source."

    return {
        "candidate_id": f"IND-2026-{idx:04d}",
        "name": name,
        "email": email,
        "phone": phone,
        "college": college,
        "city": city,
        "degree": degree,
        "graduation_year": grad_year,
        "primary_track": track,
        "skills": skills_str,
        "current_company": company,
        "current_role": role,
        "internship_status": internship_status,
        "github_url": github,
        "linkedin_url": linkedin,
        "hackathons_attended": hackathons_attended,
        "hackathon_honors": honor,
        "lead_score": lead_score,
        "crm_status": status,
        "context_summary": context_summary
    }

def main():
    os.makedirs("data", exist_ok=True)
    out_path = "data/indian_students_1000.csv"
    fieldnames = [
        "candidate_id", "name", "email", "phone", "college", "city",
        "degree", "graduation_year", "primary_track", "skills",
        "current_company", "current_role", "internship_status",
        "github_url", "linkedin_url", "hackathons_attended",
        "hackathon_honors", "lead_score", "crm_status", "context_summary"
    ]
    
    with open(out_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for i in range(1, 1001):
            writer.writerow(generate_student(i))
            
    print(f"Successfully generated 1000 Indian students CSV at: {out_path}")

if __name__ == "__main__":
    main()
