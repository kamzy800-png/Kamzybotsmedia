import { useEffect, useRef, useState } from "react";
import { Loader2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyPaystackPayment } from "@/lib/api/payment";

declare global { interface Window { PaystackPop: { setup(o: Record<string, unknown>): { openIframe(): void } } } }

const PRESETS = [1000, 2000, 5000, 10000, 20000, 50000];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  defaultAmount?: number;
  onFunded?: (newBalance: number | null) => void;
};

export function PaystackTopUpDialog({ open, onOpenChange, user, defaultAmount, onFunded }: Props) {
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [loading, setLoading] = useState(false);
  const psLoaded = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (defaultAmount) setAmount(String(defaultAmount));
    if (psLoaded.current || typeof document === "undefined") return;
    if (document.querySelector('script[src="https://js.paystack.co/v1/inline.js"]')) {
      psLoaded.current = true;
      return;
    }
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.async = true;
    document.body.appendChild(s);
    psLoaded.current = true;
  }, [open, defaultAmount]);

  const amt = parseFloat(amount || "0");

  const handlePay = async () => {
    if (amt < 100) return toast.error("Minimum top-up is ₦100");

    const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;
    if (!publicKey) return toast.error("Paystack is not configured yet — contact admin");
    if (!window.PaystackPop) return toast.error("Paystack is still loading — please wait a moment");

    setLoading(true);
    const ref = `ss-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

    const { error: intentErr } = await supabase.from("payment_intents").insert({
      user_id: user.id, provider: "paystack", reference: ref, amount: amt, currency: "NGN", status: "pending",
    });

    setLoading(false);
    if (intentErr) return toast.error("Failed to initialize payment");

    const handler = window.PaystackPop.setup({
      key: publicKey,
      email: user.email,
      amount: Math.round(amt * 100),
      ref,
      currency: "NGN",
      metadata: { userId: user.id },
      onSuccess: async (tx: { reference: string }) => {
        const tid = toast.loading("Verifying payment…");
        try {
          const result = await verifyPaystackPayment({ reference: tx.reference, userId: user.id });
          toast.dismiss(tid);
          if (result.alreadyCredited) toast.info("Payment already credited");
          else toast.success(`₦${result.amount?.toLocaleString()} added to your wallet!`);
          const { data } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
          onFunded?.(data ? Number(data.balance) : null);
          onOpenChange(false);
          setAmount("");
        } catch (err: unknown) {
          toast.dismiss(tid);
          toast.error(err instanceof Error ? err.message : "Verification failed — contact support");
        }
      },
      onCancel: () => toast.info("Payment cancelled"),
    });

    handler.openIframe();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-brand-navy">
            <CreditCard className="w-5 h-5 text-brand-orange" />
            Fund Your Wallet
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-4">
          <p className="text-sm text-muted-foreground">
            Pay instantly via card, bank transfer, or USSD. Funds are credited to your wallet on success.
          </p>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-2 block">Quick amounts</Label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button key={p} type="button" onClick={() => setAmount(String(p))}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${amount === String(p) ? "bg-brand-orange text-white border-brand-orange" : "border-border hover:border-brand-orange hover:text-brand-orange"}`}>
                  ₦{p.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="topup-amount">Amount (₦)</Label>
            <Input id="topup-amount" type="number" min="100" placeholder="Enter amount" value={amount}
              onChange={(e) => setAmount(e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePay} disabled={loading || amt < 100} className="bg-brand-orange hover:bg-brand-orange-hover text-white">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Pay ₦{amt > 0 ? amt.toLocaleString() : "—"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
