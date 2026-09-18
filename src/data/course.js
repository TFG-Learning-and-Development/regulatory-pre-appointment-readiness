export const course = {
  title: 'Regulatory Pre-appointment Readiness',
  subtitle: 'Preparing to Become a TFG Insure Representative or Key Individual',
};

export const lessons = [
  { number: '0', slug: 'why-this-course-matters', title: 'Why this course matters' },
  { number: '1', slug: 'appointment-readiness', title: 'Appointment Readiness: Representatives and Key Individuals' },
  { number: '2', slug: 'conflict-of-interest', title: 'Conflict of Interest and Disclosure of Interest' },
  { number: '3', slug: 'permissible-financial-interests', title: 'Permissible Financial Interests and Your Disclosure Responsibilities' },
  { number: '4', slug: 'disclosure-mechanisms', title: 'Disclosure Mechanisms and Consequences' },
  { number: '5', slug: 'debarment', title: 'Debarment' },
  { number: 'Conclusion', slug: 'course-conclusion', title: 'Course Conclusion', conclusion: true },
];

export const routeFor = (slug) => `/lessons/${slug}/`;
