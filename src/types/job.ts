export interface JobData {
  jobId: string;
  title: string;
  url: string;
  description: string;
  skills: string[];
  projectType: 'fixed' | 'hourly';
  experienceLevel: string;
  budget?: {
    amount: number;
    currency: string;
  };
  hourly?: {
    min: number;
    max: number;
    currency: string;
  };
  postedAt: string; // ISO date string
  connectsRequired?: number;
  client: {
    country: string;
    paymentVerified: boolean;
    rating: number;
    totalSpent: string;
    hires: number;
    jobsPosted: number;
  };
  pageNumber: number;
}

export interface JobSummary {
  pagesVisited: number;
  jobsCollected: number;
  uniqueJobIds: number;
  durationMs: number;
  failures: string[];
}

export interface JobTile {
  index: number;
  jobId: string | null;
  title: string | null;
  href: string | null;
  posted: string | null;
  rawHtml: string;
}
