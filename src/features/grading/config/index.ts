/** Phí cho mỗi thẻ gửi chấm */
export const GRADING_FEE = 50

/** Số ngày in-game để chấm xong */
export const GRADING_DURATION_DAYS = 2

/**
 * Bảng tỷ lệ grade theo PSA.
 * prob phải cộng tổng = 1.0.
 * multiplier = hệ số nhân giá bán vs marketPrice.
 */
export interface GradeProbabilityEntry {
  grade: number
  prob: number
  multiplier: number
  label: string       // Hiển thị
  cssClass: string    // CSS class để style slab
}

export const GRADE_TABLE: GradeProbabilityEntry[] = [
  { grade: 10, prob: 0.05, multiplier: 20,  label: 'PRISTINE', cssClass: 'grade-10' },
  { grade: 9,  prob: 0.15, multiplier: 8,   label: 'MINT',     cssClass: 'grade-9'  },
  { grade: 8,  prob: 0.20, multiplier: 4,   label: 'NM-MT',    cssClass: 'grade-8'  },
  { grade: 7,  prob: 0.20, multiplier: 2.5, label: 'NM',       cssClass: 'grade-7'  },
  { grade: 6,  prob: 0.15, multiplier: 1.8, label: 'EX-MT',    cssClass: 'grade-6'  },
  { grade: 5,  prob: 0.10, multiplier: 1.3, label: 'EX',       cssClass: 'grade-5'  },
  { grade: 4,  prob: 0.07, multiplier: 1.0, label: 'VG-EX',    cssClass: 'grade-4'  },
  { grade: 3,  prob: 0.04, multiplier: 0.7, label: 'VG',       cssClass: 'grade-3'  },
  { grade: 2,  prob: 0.02, multiplier: 0.5, label: 'GOOD',     cssClass: 'grade-2'  },
  { grade: 1,  prob: 0.02, multiplier: 0.3, label: 'POOR',     cssClass: 'grade-1'  },
]
