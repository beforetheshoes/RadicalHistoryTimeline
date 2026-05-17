export type DatePrecision =
  | "day"
  | "month"
  | "season"
  | "year"
  | "decade"
  | "circa";

export type EventDate = {
  year: number;
  month?: number;
  day?: number;
  precision: DatePrecision;
  rangeEndYear?: number;
};

export type Citation = {
  chapter: string;
  chapterIndex: number;
  paragraphIndex: number;
  quote: string;
  page?: number | string;
};

export type TimelineEvent = {
  id: string;
  book: string;
  date: EventDate;
  displayDate: string;
  title: string;
  summary: string;
  category?: string;
  location?: string;
  people?: string[];
  tags?: string[];
  citation: Citation;
};

export type Book = {
  slug: string;
  title: string;
  subtitle?: string;
  author: string;
  yearPublished: number;
  color: string;
  shortName: string;
  description: string;
  sourceEpub: string;
  extractedDir: string;
  eventsFile: string;
};
