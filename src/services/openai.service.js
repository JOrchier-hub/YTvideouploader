import OpenAI from 'openai';
import { config } from '../config/config.js';

let openai = null;

try {
  if (config.openai.apiKey) {
    openai = new OpenAI({
      apiKey: config.openai.apiKey
    });
  }
} catch (error) {
  console.warn('OpenAI initialization failed:', error.message);
}

export async function generateMetadata(videoTitle) {
  // If OpenAI is not initialized or fails, return basic metadata
  if (!openai) {
    return {
      title: videoTitle,
      description: `Uploaded video: ${videoTitle}`,
      tags: []
    };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a YouTube SEO expert. Generate metadata in JSON format with these fields: title (engaging version of input title), description (compelling 2-3 paragraphs), tags (15-20 relevant keywords as array)."
        },
        {
          role: "user",
          content: `Generate optimized YouTube metadata for this video title: "${videoTitle}". Return only valid JSON.`
        }
      ],
      response_format: { type: "json_object" }
    });

    const metadata = JSON.parse(completion.choices[0].message.content);
    
    return {
      title: metadata.title || videoTitle,
      description: metadata.description || '',
      tags: Array.isArray(metadata.tags) ? metadata.tags : []
    };
  } catch (error) {
    console.warn('OpenAI API error:', error);
    // Fallback to original title if API fails
    return {
      title: videoTitle,
      description: `Uploaded video: ${videoTitle}`,
      tags: []
    };
  }
}