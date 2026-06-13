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
