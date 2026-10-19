'use client';
import { useState } from 'react';
import Tabs from './Tabs';
import CurriculumBuilder from './CurriculumBuilder';
import QuestionBox from './QuestionBox';
import CopyInviteLink from '../trainings/CopyInviteLink';
import PostComposer from '../trainings/PostComposer';
import DayPricingEditor from '../trainings/DayPricingEditor';
import ModeratorInvite from '../trainings/ModeratorInvite';
import IssueCertificates from '../trainings/IssueCertificates';

export type WorkspaceDay = {
  id: string;
  dayIndex: number;
  topic: string | null;
  dateUtc: string;
  accessType: string;
  priceNgn: number;
  sessionCount: number;
  enrolled: number;
  sold: number;
  started: boolean;
};

/**
 * The trainer's side of a class, as one tabbed workspace.
 *
 * These were five separate blocks stacked down a page: prepare it, share it, answer
 * questions, put it in front of people, and the settings you touch once. A trainer opening
 * their own class had to scroll past all of it to reach the thing they came for.
 *
 * Each tab is one job, and the tabs are the same size whatever they are called -- which is
 * why they are a grid and not a row of buttons that size themselves to their labels.
 *
 * The learner-facing controls are deliberately not here. Join and Reserve live on the shared
 * link, which is where somebody who is not the trainer actually arrives.
 */
export default function ClassWorkspace({
  trainingId,
  inviteUrl,
  tier,
  accessType,
  certMode,
  minPct,
  days,
}: {
  trainingId: string;
  inviteUrl: string;
  tier: string | null;
  accessType: string;
  certMode: string;
  minPct: number;
  days: WorkspaceDay[];
}) {
  const [tab, setTab] = useState<'prepare' | 'share' | 'questions' | 'post' | 'settings'>('prepare');

  return (
    <div>
      <Tabs
        tabs={[
          { key: 'prepare', label: 'Prepare' },
          { key: 'share', label: 'Share' },
          { key: 'questions', label: 'Questions' },
          { key: 'post', label: 'Post' },
          { key: 'settings', label: 'Settings' },
        ]}
        value={tab}
        onChange={(k) => setTab(k as typeof tab)}
        accent="#FBBF24"
      />

      <div style={{ marginTop: 16 }}>
        {tab === 'prepare' && (
          <CurriculumBuilder trainingId={trainingId} />
        )}

        {tab === 'share' && (
          <div className="card" style={{ padding: 16 }}>
            <p className="eyebrow" style={{ marginBottom: 8 }}>Share this class</p>
            <CopyInviteLink url={inviteUrl} />
            <p className="muted" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
              Anyone who opens this link can register for a seat. It works in a browser — no app
              needed, and no account to create before they can see what the class is.
            </p>
          </div>
        )}

        {tab === 'questions' && (
          <QuestionBox trainingId={trainingId} readOnly />
        )}

        {tab === 'post' && (
          <div className="card" style={{ padding: 16 }}>
            <PostComposer trainingId={trainingId} />
          </div>
        )}

        {tab === 'settings' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <h3 className="u-h-md">Days &amp; pricing</h3>
              <div className="card" style={{ marginTop: 10 }}>
                <DayPricingEditor
                  trainingId={trainingId}
                  tier={tier}
                  accessType={accessType}
                  days={days}
                />
              </div>
            </div>

            <div>
              <h3 className="u-h-md">Moderators</h3>
              <div className="card" style={{ marginTop: 10 }}>
                <ModeratorInvite trainingId={trainingId} />
              </div>
            </div>

            <IssueCertificates trainingId={trainingId} />
          </div>
        )}
      </div>
    </div>
  );
}