/**
 * Example implementations showing how to use the generic stream messages system
 * for different types of APIs and operations.
 */

import { Response } from "express";
import {
  BaseStreamEventType,
  createStreamSender,
  createStreamMessage,
  initializeSSEResponse,
  StreamSender
} from "./stream-messages";

// ============================================================================
// Example 1: Simple Single-Page Scraper
// ============================================================================

type SimpleScraperEventType = BaseStreamEventType | 'fetching' | 'parsing' | 'saving';
type SimpleScraperMetadata = {
  url?: string;
  itemCount?: number;
};

export const simpleSinglePageScraper = async (url: string, res: Response) => {
  initializeSSEResponse(res);
  
  const streamSender = createStreamSender<SimpleScraperEventType, SimpleScraperMetadata>(res);

  streamSender(createStreamMessage('status', 'Starting single page scrape', { url }));
  
  streamSender(createStreamMessage('fetching', `Fetching data from ${url}`, { url }));
  
  // ... fetch logic ...
  
  streamSender(createStreamMessage('parsing', 'Parsing HTML content', { url }));
  
  // ... parsing logic ...
  
  streamSender(createStreamMessage('saving', 'Saving results to database', { itemCount: 42 }));
  
  streamSender(createStreamMessage('complete', 'Scraping completed', { itemCount: 42 }));
  
  res.end();
};

// ============================================================================
// Example 2: File Processing API
// ============================================================================

type FileProcessingEventType = 
  | BaseStreamEventType 
  | 'uploading' 
  | 'validating' 
  | 'processing' 
  | 'converting';

type FileProcessingMetadata = {
  fileName?: string;
  fileSize?: number;
  processed?: number;
};

export const processFile = async (file: any, res: Response) => {
  initializeSSEResponse(res);
  
  const streamSender = createStreamSender<FileProcessingEventType, FileProcessingMetadata>(res, {
    logPrefix: '📄'
  });

  streamSender(createStreamMessage(
    'uploading',
    'Uploading file...',
    { fileName: file.name, fileSize: file.size }
  ));

  streamSender(createStreamMessage(
    'validating',
    'Validating file format...',
    { fileName: file.name }
  ));

  streamSender(createStreamMessage(
    'processing',
    'Processing file...',
    { fileName: file.name, percentage: 50 }
  ));

  streamSender(createStreamMessage(
    'complete',
    'File processed successfully',
    { fileName: file.name, percentage: 100 }
  ));

  res.end();
};

// ============================================================================
// Example 3: Batch Email Sender
// ============================================================================

type EmailEventType = 
  | BaseStreamEventType 
  | 'preparing' 
  | 'sending' 
  | 'sent' 
  | 'failed';

type EmailMetadata = {
  recipientEmail?: string;
  sent?: number;
  failed?: number;
};

export const sendBatchEmails = async (emails: string[], res: Response) => {
  initializeSSEResponse(res);
  
  const streamSender = createStreamSender<EmailEventType, EmailMetadata>(res);

  let sent = 0;
  let failed = 0;

  streamSender(createStreamMessage(
    'preparing',
    `Preparing to send ${emails.length} emails`,
    { total: emails.length }
  ));

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    
    streamSender(createStreamMessage(
      'sending',
      `Sending email ${i + 1} of ${emails.length}`,
      {
        current: i + 1,
        total: emails.length,
        percentage: Math.round(((i + 1) / emails.length) * 100),
        recipientEmail: email
      }
    ));

    // Simulate sending...
    const success = Math.random() > 0.1;
    
    if (success) {
      sent++;
      streamSender(createStreamMessage(
        'sent',
        `Email sent to ${email}`,
        { recipientEmail: email, sent, failed }
      ));
    } else {
      failed++;
      streamSender(createStreamMessage(
        'failed',
        `Failed to send email to ${email}`,
        { recipientEmail: email, sent, failed }
      ));
    }
  }

  streamSender(createStreamMessage(
    'complete',
    `Batch complete: ${sent} sent, ${failed} failed`,
    { sent, failed, total: emails.length, percentage: 100 }
  ));

  res.end();
};

// ============================================================================
// Example 4: Social Media Multi-Platform Scraper
// ============================================================================

type SocialMediaEventType = 
  | BaseStreamEventType 
  | 'platform_start' 
  | 'platform_complete' 
  | 'post_found' 
  | 'profile_found';

type SocialMediaMetadata = {
  platform?: 'twitter' | 'instagram' | 'facebook' | 'linkedin';
  postsFound?: number;
  profilesFound?: number;
};

export const scrapeSocialMedia = async (
  platforms: string[],
  query: string,
  res: Response
) => {
  initializeSSEResponse(res);
  
  const streamSender = createStreamSender<SocialMediaEventType, SocialMediaMetadata>(res, {
    logPrefix: '📱'
  });

  streamSender(createStreamMessage(
    'status',
    `Starting social media scrape for "${query}" across ${platforms.length} platforms`,
    { total: platforms.length }
  ));

  for (let i = 0; i < platforms.length; i++) {
    const platform = platforms[i] as any;
    
    streamSender(createStreamMessage(
      'platform_start',
      `Starting ${platform} scrape...`,
      {
        platform,
        current: i + 1,
        total: platforms.length,
        percentage: Math.round(((i + 1) / platforms.length) * 100)
      }
    ));

    // Simulate scraping...
    const postsFound = Math.floor(Math.random() * 50);
    const profilesFound = Math.floor(Math.random() * 20);

    streamSender(createStreamMessage(
      'post_found',
      `Found ${postsFound} posts on ${platform}`,
      { platform, postsFound }
    ));

    streamSender(createStreamMessage(
      'profile_found',
      `Found ${profilesFound} profiles on ${platform}`,
      { platform, profilesFound }
    ));

    streamSender(createStreamMessage(
      'platform_complete',
      `Completed ${platform} scrape`,
      { platform, postsFound, profilesFound }
    ));
  }

  streamSender(createStreamMessage(
    'complete',
    'All platforms scraped successfully',
    { percentage: 100 }
  ));

  res.end();
};

// ============================================================================
// Example 5: Database Migration Progress
// ============================================================================

type MigrationEventType = 
  | BaseStreamEventType 
  | 'connecting' 
  | 'migrating_table' 
  | 'table_complete' 
  | 'rollback';

type MigrationMetadata = {
  table?: string;
  recordsMigrated?: number;
  tablesComplete?: number;
};

export const runDatabaseMigration = async (
  tables: string[],
  res: Response
) => {
  initializeSSEResponse(res);
  
  const streamSender = createStreamSender<MigrationEventType, MigrationMetadata>(res);

  streamSender(createStreamMessage(
    'connecting',
    'Connecting to database...',
    {}
  ));

  streamSender(createStreamMessage(
    'status',
    `Starting migration for ${tables.length} tables`,
    { total: tables.length }
  ));

  let tablesComplete = 0;

  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    
    streamSender(createStreamMessage(
      'migrating_table',
      `Migrating table: ${table}`,
      {
        table,
        current: i + 1,
        total: tables.length,
        tablesComplete
      }
    ));

    // Simulate migration...
    const recordsMigrated = Math.floor(Math.random() * 10000);

    streamSender(createStreamMessage(
      'table_complete',
      `Completed migration for ${table}`,
      {
        table,
        recordsMigrated,
        tablesComplete: ++tablesComplete,
        percentage: Math.round((tablesComplete / tables.length) * 100)
      }
    ));
  }

  streamSender(createStreamMessage(
    'complete',
    'Migration completed successfully',
    { tablesComplete, percentage: 100 }
  ));

  res.end();
};

// ============================================================================
// Example 6: Using Without Response (Testing/Dry-run)
// ============================================================================

export const testWithoutResponse = async () => {
  // Pass null to disable streaming but keep console logging
  const streamSender = createStreamSender<BaseStreamEventType, {}>(null, {
    enableConsoleLog: true,
    logPrefix: '🧪 TEST'
  });

  streamSender(createStreamMessage('status', 'This will only log to console'));
  streamSender(createStreamMessage('complete', 'No HTTP response sent'));
};

// ============================================================================
// Type-Safe Custom Stream Sender Factory
// ============================================================================

/**
 * Factory function to create a custom stream sender with predefined types
 */
export const createCustomStreamSender = <
  TEventType extends BaseStreamEventType,
  TMetadata extends Record<string, any>
>(
  res: Response | null,
  options?: {
    enableConsoleLog?: boolean;
    logPrefix?: string;
  }
): StreamSender<TEventType, TMetadata> => {
  return createStreamSender<TEventType, TMetadata>(res, options);
};
