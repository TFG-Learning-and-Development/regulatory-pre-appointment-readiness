export const course = {
  title: 'Regulatory Pre-appointment Readiness',
  subtitle: 'Preparing to Become a TFG Insure Representative or Key Individual',
};

export const lessons = [
  { number: '0', slug: 'why-this-course-matters', title: 'Why this course matters' },
  { number: '1', slug: 'understanding-tfg-insure-and-your-regulatory-responsibilities', title: 'Understanding TFG Insure and Your Regulatory Responsibilities' },
  { number: '2', slug: 'appointment-readiness', title: 'Appointment Readiness: Representatives and Key Individuals' },
  { number: '3', slug: 'conflict-of-interest', title: 'Conflict of Interest and Disclosure of Interest' },
  { number: '4', slug: 'permissible-financial-interests', title: 'Permissible Financial Interests and Your Disclosure Responsibilities' },
  { number: '5', slug: 'disclosure-mechanisms', title: 'Disclosure Mechanisms and Consequences' },
  { number: '6', slug: 'debarment', title: 'Debarment' },
  { number: 'Conclusion', slug: 'course-conclusion', title: 'Course Conclusion', conclusion: true },
];

export const routeFor = (slug, currentSlug = '') => currentSlug
  ? `./${slug}.html`
  : `./lessons/${slug}.html`;

export const homeRouteFor = (currentSlug = '') => currentSlug ? '../index.html' : './index.html';
