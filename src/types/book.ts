export type BookType = 'pdf' | 'epub' | 'public';

export type Book = {
  id: string;
  title: string;
  author: string;
  type: BookType;
  totalPages: number;
  currentPage: number;
  progressPercent: number;
  currentChapter?: string;
  totalChapters?: number;
  lastReadAt: Date | null;
  addedAt: Date;
  coverColor: string;
};
