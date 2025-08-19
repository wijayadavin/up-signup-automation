import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { User } from '../types/database.js';
import { getLogger } from './logger.js';

const logger = getLogger(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ResumeData {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  rate: string;
  professionalTitle: string;
  bio: string;
  skills: string[];
  workExperience: Array<{
    title: string;
    company: string;
    location: string;
    startDate: string;
    endDate: string;
    description: string[];
    isCurrentRole?: boolean;
  }>;
  education: Array<{
    school: string;
    degree: string;
    fieldOfStudy: string;
    startYear: string;
    endYear: string;
    description?: string;
  }>;
  languages: Array<{
    language: string;
    proficiency: string;
  }>;
  profilePicturePath?: string;
}

export class ResumeGenerator {
  private static getResumeData(user: User): ResumeData {
    // Map country code to country name
    const getCountryName = (code: string): string => {
      switch (code.toUpperCase()) {
        case 'US': return 'United States';
        case 'ID': return 'Indonesia';
        case 'UA': return 'Ukraine';
        case 'GB': return 'United Kingdom';
        default: return 'United States';
      }
    };

    const countryName = getCountryName(user.country_code);
    const location = `${user.location_city || 'San Francisco'}, ${user.location_state || 'California'}, ${countryName}`;
    
    // Format phone number with country code
    const phone = ResumeGenerator.formatPhoneNumberWithCountryCode(user.phone || '5550123456', user.country_code);
    
    // Generate random hourly rate between $10-$20
    const minRate = 10;
    const maxRate = 20;
    const randomRate = Math.floor(Math.random() * (maxRate - minRate + 1)) + minRate;
    const rate = `$${randomRate}/hr`;
    
    return {
      fullName: `${user.first_name} ${user.last_name}`,
      email: user.email,
      phone: phone,
      location: location,
      linkedin: undefined, // Not available in User type
      rate: rate,
      professionalTitle: 'Full-Stack Software Engineer',
      bio: `Experienced Full-Stack Software Engineer with over 4 years of expertise in developing scalable web applications and leading development teams. Passionate about creating innovative solutions using modern technologies including React, Node.js, Python, and cloud platforms. Proven track record of delivering high-quality software products, optimizing performance, and mentoring junior developers. Strong background in database design, API development, and DevOps practices. Committed to writing clean, maintainable code and staying current with industry best practices and emerging technologies.`,
      skills: [
        'Database',
        'Database Management',
        'JavaScript',
        'TypeScript',
        'React',
        'Node.js',
        'Python',
        'SQL',
        'MongoDB',
        'PostgreSQL',
        'AWS',
        'Docker',
        'Git',
        'Agile Development',
        'API Development',
        'Full-Stack Development'
      ],
      workExperience: [
        {
          title: 'Senior Software Engineer',
          company: 'Tech Solutions Inc',
          location: countryName,
          startDate: 'January 2020',
          endDate: 'Present',
          isCurrentRole: true,
          description: [
            'Developed and maintained full-stack web applications using modern technologies including React, Node.js, and Python',
            'Led a team of 5 developers in implementing CI/CD pipelines and DevOps practices using Docker and AWS',
            'Designed and optimized database schemas for high-performance applications using PostgreSQL and MongoDB',
            'Implemented RESTful APIs and microservices architecture for scalable enterprise solutions',
            'Collaborated with cross-functional teams including product managers and designers to deliver user-centric solutions',
            'Mentored junior developers and conducted code reviews to maintain high code quality standards',
            'Reduced application load times by 40% through performance optimization and caching strategies',
            'Implemented automated testing frameworks achieving 90% code coverage across critical modules'
          ]
        }
      ],
      education: [
        {
          school: 'University of Technology',
          degree: 'Bachelor of Science (BS)',
          fieldOfStudy: 'Computer Science',
          startYear: '2016',
          endYear: '2020',
          description: 'Relevant coursework: Data Structures, Algorithms, Database Systems, Software Engineering'
        }
      ],
      languages: [
        {
          language: 'English',
          proficiency: 'Conversational'
        }
      ],
      profilePicturePath: path.join(__dirname, '../../assets/images/profile-picture.png')
    };
  }

  static async generateResume(user: User): Promise<string> {
    try {
      logger.info('Generating ATS-friendly PDF resume for user', user.id);
      
      const resumeData = this.getResumeData(user);
      const outputPath = path.join(__dirname, '../../assets/resumes', `resume_${user.id}.pdf`);
      
      // Create PDF document
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });
      
      // Pipe to file
      doc.pipe(fs.createWriteStream(outputPath));
      
      // Set default font and font size
      doc.font('Helvetica').fontSize(11);
      
      let yPosition = 80;
      
      // Header Section
      doc.fontSize(18).font('Helvetica-Bold');
      doc.text(resumeData.fullName, 50, yPosition, { align: 'left' });
      yPosition += 25;
      
      doc.fontSize(11).font('Helvetica');
      doc.text(`Phone: ${resumeData.phone}`, 50, yPosition);
      yPosition += 15;
      doc.text(`Email: ${resumeData.email}`, 50, yPosition);
      yPosition += 15;
      doc.text(`Address: ${resumeData.location}`, 50, yPosition);
      yPosition += 15;
      doc.text(`Rate: ${resumeData.rate}`, 50, yPosition);
      if (resumeData.linkedin) {
        yPosition += 15;
        doc.text(`LinkedIn: ${resumeData.linkedin}`, 50, yPosition);
      }
      yPosition += 30;
      
      // Professional Title
      doc.fontSize(14).font('Helvetica-Bold');
      doc.text('PROFESSIONAL TITLE', 50, yPosition);
      yPosition += 20;
      doc.fontSize(11).font('Helvetica');
      doc.text(resumeData.professionalTitle, 50, yPosition);
      yPosition += 30;
      
      // Bio/Summary Section
      doc.fontSize(14).font('Helvetica-Bold');
      doc.text('PROFESSIONAL SUMMARY', 50, yPosition);
      yPosition += 20;
      doc.fontSize(11).font('Helvetica');
      doc.text(resumeData.bio, 50, yPosition, { width: 500, align: 'left' });
      yPosition += doc.heightOfString(resumeData.bio, { width: 500 }) + 20;
      
      // Skills Section
      doc.fontSize(14).font('Helvetica-Bold');
      doc.text('SKILLS', 50, yPosition);
      yPosition += 20;
      doc.fontSize(11).font('Helvetica');
      const skillsText = resumeData.skills.join(', ');
      doc.text(skillsText, 50, yPosition, { width: 500, align: 'left' });
      yPosition += doc.heightOfString(skillsText, { width: 500 }) + 20;
      
      // Work Experience Section
      doc.fontSize(14).font('Helvetica-Bold');
      doc.text('WORK EXPERIENCE', 50, yPosition);
      yPosition += 20;
      
      resumeData.workExperience.forEach((job) => {
        doc.fontSize(12).font('Helvetica-Bold');
        doc.text(job.title, 50, yPosition);
        yPosition += 15;
        
        doc.fontSize(11).font('Helvetica');
        doc.text(`${job.company} | ${job.location}`, 50, yPosition);
        yPosition += 15;
        
        const dateText = job.isCurrentRole ? `${job.startDate} - Present` : `${job.startDate} - ${job.endDate}`;
        doc.text(dateText, 50, yPosition);
        yPosition += 15;
        
        job.description.forEach((bullet) => {
          doc.text(`• ${bullet}`, 50, yPosition, { width: 500 });
          yPosition += doc.heightOfString(`• ${bullet}`, { width: 500 }) + 5;
        });
        yPosition += 15;
      });
      
      // Education Section
      doc.fontSize(14).font('Helvetica-Bold');
      doc.text('EDUCATION', 50, yPosition);
      yPosition += 20;
      
      resumeData.education.forEach((edu) => {
        doc.fontSize(12).font('Helvetica-Bold');
        doc.text(`${edu.degree} in ${edu.fieldOfStudy}`, 50, yPosition);
        yPosition += 15;
        
        doc.fontSize(11).font('Helvetica');
        doc.text(edu.school, 50, yPosition);
        yPosition += 15;
        
        doc.text(`${edu.startYear} - ${edu.endYear}`, 50, yPosition);
        yPosition += 15;
        
        if (edu.description) {
          doc.text(edu.description, 50, yPosition, { width: 500 });
          yPosition += doc.heightOfString(edu.description, { width: 500 }) + 15;
        }
      });
      
      // Languages Section
      doc.fontSize(14).font('Helvetica-Bold');
      doc.text('LANGUAGES', 50, yPosition);
      yPosition += 20;
      
      doc.fontSize(11).font('Helvetica');
      resumeData.languages.forEach((lang) => {
        doc.text(`${lang.language} - ${lang.proficiency}`, 50, yPosition);
        yPosition += 15;
      });
      
      // Finalize PDF
      doc.end();
      
      // Wait for PDF to be written
      await new Promise((resolve, reject) => {
        doc.on('end', resolve);
        doc.on('error', reject);
      });
      
      logger.info(`Resume PDF generated successfully: ${outputPath}`);
      return outputPath;
      
    } catch (error) {
      logger.error('Failed to generate resume PDF:', error);
      throw error;
    }
  }

  static async generatePlainTextResume(user: User): Promise<string> {
    try {
      logger.info('Generating plain text resume for user', user.id);
      
      const resumeData = this.getResumeData(user);
      
      let resume = '';
      
      // Header
      resume += `${resumeData.fullName}\n`;
      resume += `Phone: ${resumeData.phone}\n`;
      resume += `Email: ${resumeData.email}\n`;
      resume += `Address: ${resumeData.location}\n`;
      resume += `Rate: ${resumeData.rate}\n`;
      if (resumeData.linkedin) {
        resume += `LinkedIn: ${resumeData.linkedin}\n`;
      }
      resume += '\n';
      
      // Professional Title
      resume += 'PROFESSIONAL TITLE\n';
      resume += `${resumeData.professionalTitle}\n\n`;
      
      // Bio/Summary
      resume += 'PROFESSIONAL SUMMARY\n';
      resume += `${resumeData.bio}\n\n`;
      
      // Skills
      resume += 'SKILLS\n';
      resume += `${resumeData.skills.join(', ')}\n\n`;
      
      // Work Experience
      resume += 'WORK EXPERIENCE\n';
      resumeData.workExperience.forEach((job) => {
        resume += `${job.title}\n`;
        resume += `${job.company} | ${job.location}\n`;
        const dateText = job.isCurrentRole ? `${job.startDate} - Present` : `${job.startDate} - ${job.endDate}`;
        resume += `${dateText}\n`;
        job.description.forEach((bullet) => {
          resume += `• ${bullet}\n`;
        });
        resume += '\n';
      });
      
      // Education
      resume += 'EDUCATION\n';
      resumeData.education.forEach((edu) => {
        resume += `${edu.degree} in ${edu.fieldOfStudy}\n`;
        resume += `${edu.school}\n`;
        resume += `${edu.startYear} - ${edu.endYear}\n`;
        if (edu.description) {
          resume += `${edu.description}\n`;
        }
        resume += '\n';
      });
      
      // Languages
      resume += 'LANGUAGES\n';
      resumeData.languages.forEach((lang) => {
        resume += `${lang.language} - ${lang.proficiency}\n`;
      });
      
      const outputPath = path.join(__dirname, '../../assets/resumes', `resume_${user.id}.txt`);
      fs.writeFileSync(outputPath, resume);
      
      logger.info(`Plain text resume generated successfully: ${outputPath}`);
      return outputPath;
      
    } catch (error) {
      logger.error('Failed to generate plain text resume:', error);
      throw error;
    }
  }

  private static formatPhoneNumberWithCountryCode(phoneNumber: string, countryCode: string): string {
    // Remove any existing country code or formatting
    let cleanNumber = phoneNumber.replace(/^\+?\d{1,3}\s?/, '').replace(/\D/g, '');
    
    // Add country code based on user's country
    const countryCodeMap: { [key: string]: string } = {
      'US': '+1',
      'GB': '+44', 
      'UA': '+380',
      'ID': '+62'
    };
    
    const prefix = countryCodeMap[countryCode.toUpperCase()];
    if (!prefix) {
      return phoneNumber; // Return original if country code not supported
    }
    
    // Format the number with country code
    return `${prefix} ${cleanNumber}`;
  }
}
