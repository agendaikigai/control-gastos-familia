import { createClient } from '@supabase/supabase-js'

// Reemplaza con los valores de tu proyecto en Supabase (Settings -> API)
const SUPABASE_URL = 'https://lrrdmknsjzcabsncyjjs.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycmRta25zanpjYWJzbmN5ampzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0MDk2ODYsImV4cCI6MjEwOTk4NTY4Nn0.W-bs_SFwPArgwOfjgntymS1MnjAobgUd4W003Ih2t1I'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)