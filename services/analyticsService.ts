import { supabase } from '../lib/supabase';

// Define event types for strict typing
export type AnalyticsEvent = 
  | 'APP_LAUNCH'
  | 'LOGIN_SUCCESS'
  | 'SIGNUP_SUCCESS'
  | 'COURSE_GENERATE_START'
  | 'COURSE_GENERATE_SUCCESS'
  | 'COURSE_GENERATE_FAIL'
  | 'LESSON_START'
  | 'LESSON_COMPLETE'
  | 'QUIZ_SUBMIT'
  | 'EXAM_SUBMIT'
  | 'PROFILE_UPDATE';

interface EventProperties {
  [key: string]: any;
}

export const trackEvent = async (eventName: AnalyticsEvent, properties?: EventProperties) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    
    // We fire and forget - don't await the result to block UI
    supabase.from('analytics_events').insert({
      user_id: user?.id || null, // Ensure explicit null for guests
      event_name: eventName,
      properties: properties || {},
      client_info: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        screen: `${window.screen.width}x${window.screen.height}`
      }
    }).then(({ error }) => {
      if (error) console.error('Telemetry Error:', error);
    });

  } catch (e) {
    console.warn('Failed to track event', e);
  }
};
