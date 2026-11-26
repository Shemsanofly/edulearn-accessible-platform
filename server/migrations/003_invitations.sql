-- EduLearn 003 — invitation-based registration.
-- People join the school only through an invitation an administrator issued. The role, email and
-- (for parents/students) the family or class links come from the invitation, never from the person registering.

CREATE TABLE invitations (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash        text      NOT NULL UNIQUE,
  email             citext    NOT NULL,
  role              user_role NOT NULL,
  first_name        text      NOT NULL,
  last_name         text      NOT NULL,
  -- Role-specific setup applied when the account is created:
  --   student: { "classId": 3 }   parent: { "children": [{ "studentId": 12, "relationship": "mother" }] }
  --   teacher: { "specialization": "Mathematics" }
  details           jsonb     NOT NULL DEFAULT '{}'::jsonb,
  message           text,
  invited_by        integer   REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  accepted_at       timestamptz,
  accepted_user_id  integer   REFERENCES users(id) ON DELETE SET NULL,
  revoked_at        timestamptz,
  CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);

-- At most one open invitation per email address.
CREATE UNIQUE INDEX invitations_one_open_per_email_idx ON invitations (email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX invitations_created_idx ON invitations (created_at DESC);
