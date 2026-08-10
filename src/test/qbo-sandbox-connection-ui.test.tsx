import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QboSandboxConnectionCard } from "@/components/QboSandboxConnectionCard";

const accessToken = "dummy-session-token";
const authState = vi.hoisted(() => ({ session: { access_token: "dummy-session-token" } as { access_token: string } | null }));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ session: authState.session }),
}));

describe("5JD QuickBooks Sandbox connection control", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authState.session = { access_token: accessToken };
    window.history.replaceState({}, "", "/stage-1");
  });

  it("loads authenticated status and starts only the sandbox OAuth flow", async () => {
    const request = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ configured: true, connected: false, connection: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ authorizationUrl: "https://appcenter.intuit.com/connect/oauth2?state=dummy" }), { status: 200 }));

    const navigateTo = vi.fn();
    render(<QboSandboxConnectionCard navigateTo={navigateTo} />);
    const button = await screen.findByRole("button", { name: "Connect QuickBooks Sandbox" });
    fireEvent.click(button);

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[0][0]).toBe("/api/qbo/status");
    expect(request.mock.calls[0][1]).toMatchObject({ headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    expect(request.mock.calls[1][0]).toBe("/api/qbo/connect");
    expect(request.mock.calls[1][1]).toMatchObject({ method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
    expect(navigateTo).toHaveBeenCalledWith("https://appcenter.intuit.com/connect/oauth2?state=dummy");
  });

  it("shows connected state and disconnects through the protected endpoint", async () => {
    const request = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ configured: true, connected: true, connection: { realmId: "123", connectedAt: "2026-08-10T00:00:00Z" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ connected: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ configured: true, connected: false, connection: null }), { status: 200 }));

    render(<QboSandboxConnectionCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect sandbox" }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(request.mock.calls[1][0]).toBe("/api/qbo/disconnect");
    expect(request.mock.calls[1][1]).toMatchObject({ method: "POST" });
  });

  it("runs the read-only proof and displays counts without claiming writes", async () => {
    const request = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ configured: true, connected: true, connection: { realmId: "123", connectedAt: "2026-08-10T00:00:00Z" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tokenRefreshed: true, company: { name: "Sandbox AU", country: "AU" }, counts: { customers: 12, accounts: 30, invoices: 8, payments: 5 }, writesPerformed: false }), { status: 200 }));

    render(<QboSandboxConnectionCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Run read-only proof" }));

    expect(await screen.findByText(/Read-only proof passed for Sandbox AU/)).toHaveTextContent("Token refreshed; no writes performed");
    expect(request.mock.calls[1][0]).toBe("/api/qbo/read-proof");
    expect(request.mock.calls[1][1]).toMatchObject({ method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  });

  it("is absent without an authenticated Autopsy session", async () => {
    authState.session = null;
    const { container } = render(<QboSandboxConnectionCard />);
    expect(container).toBeEmptyDOMElement();
  });
});
