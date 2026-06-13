# WF-GH-001 Test

This file exists only to trigger the n8n PR Review Intake workflow.

No runtime code is changed.

Expected result:

- GitHub pull request event fires.
- n8n creates a Notion PR Review Intake packet.
- The test PR is closed without merge after verification.

Second test event:

- This line was added while n8n was actively listening for a GitHub pull request update event.

Third test event:

- This line was added after confirming n8n was executing/listening.

Fourth test event:

- This line was added after fixing the IF node to read body.action.

Fifth test event:

- This line was added after granting the n8n Notion connection access to the PR Review Intake database.

Sixth test event:

- This line was added after selecting the Notion database through the n8n database picker.

Seventh test event:

- This line was added during a re-execution test of the Notion review packet workflow.

Eighth test event:

- This line was added after selecting PR Review Intake from the n8n Notion database picker.

Ninth test event:

- This line was added after simplifying the Notion node mapping for a minimal create-page test.
