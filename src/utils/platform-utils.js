// lib/platform-utils.js
import { 
  FacebookIcon, 
  InstagramIcon, 
  TwitterIcon, 
  LinkedInIcon, 
  YouTubeIcon, 
  TikTokIcon, 
  PinterestIcon, 
  GoogleBusinessIcon,
  DefaultPlatformIcon 
} from '@/app/lib/platform-icons';

// Platform name mapping to icons and colors
export const PLATFORM_CONFIG = {
  facebook: {
    icon: FacebookIcon,
    color: '#1877F2',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    textColor: 'text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  instagram: {
    icon: InstagramIcon,
    color: '#E4405F',
    bgColor: 'bg-pink-50 dark:bg-pink-900/20',
    textColor: 'text-pink-600 dark:text-pink-400',
    borderColor: 'border-pink-200 dark:border-pink-800'
  },
  twitter: {
    icon: TwitterIcon,
    color: '#1DA1F2',
    bgColor: 'bg-sky-50 dark:bg-sky-900/20',
    textColor: 'text-sky-600 dark:text-sky-400',
    borderColor: 'border-sky-200 dark:border-sky-800'
  },
  linkedin: {
    icon: LinkedInIcon,
    color: '#0A66C2',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    textColor: 'text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  youtube: {
    icon: YouTubeIcon,
    color: '#FF0000',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    textColor: 'text-red-600 dark:text-red-400',
    borderColor: 'border-red-200 dark:border-red-800'
  },
  tiktok: {
    icon: TikTokIcon,
    color: '#000000',
    bgColor: 'bg-gray-50 dark:bg-gray-900/20',
    textColor: 'text-gray-600 dark:text-gray-400',
    borderColor: 'border-gray-200 dark:border-gray-800'
  },
  pinterest: {
    icon: PinterestIcon,
    color: '#BD081C',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    textColor: 'text-red-600 dark:text-red-400',
    borderColor: 'border-red-200 dark:border-red-800'
  },
  google_my_business: {
    icon: GoogleBusinessIcon,
    color: '#4285F4',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    textColor: 'text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-200 dark:border-blue-800'
  }
};

// Helper function to get platform config
export const getPlatformConfig = (platformName) => {
  const normalizedPlatform = platformName?.toLowerCase().replace(/\s+/g, '_');
  return PLATFORM_CONFIG[normalizedPlatform] || {
    icon: DefaultPlatformIcon,
    color: '#6B7280',
    bgColor: 'bg-gray-50 dark:bg-gray-900/20',
    textColor: 'text-gray-600 dark:text-gray-400',
    borderColor: 'border-gray-200 dark:border-gray-800'
  };
};

// Format platform name for display
export const formatPlatformName = (platformName) => {
  const nameMap = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    twitter: 'Twitter',
    linkedin: 'LinkedIn',
    youtube: 'YouTube',
    tiktok: 'TikTok',
    pinterest: 'Pinterest',
    google_my_business: 'Google Business'
  };
  
  const normalized = platformName?.toLowerCase().replace(/\s+/g, '_');
  return nameMap[normalized] || platformName;
};