'use client';

/**
 * <HelpPanel />
 *
 * The floating "?" launcher + slide-in help drawer used everywhere in the
 * authenticated shell. Three tabs:
 *
 *   - Help        : role-specific FAQs from lib/help-content.js
 *   - What's New  : changelog entries, newest first
 *   - Contact     : in-app message form -> POST /api/support/contact
 *
 * Why a Sheet (slide-in) instead of a modal Dialog?  Help is rarely the
 * only thing the user wants visible — they're usually trying to look up
 * a tooltip about THIS form. The Sheet lets the underlying page stay in
 * sight while answering the question.
 *
 * Self-contained: doesn't depend on any context; just `user` and an
 * `onClose` would be optional. We control open/close inside this
 * component so the consumer just renders `<HelpPanel user={user} />`.
 */

import { useState, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HelpCircle, Sparkles, Mail, Loader2, Send, CheckCircle2 } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { toast } from 'sonner';
import { FAQ_BY_ROLE, CHANGELOG } from '@/lib/help-content';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { value: 'question', label: 'General question' },
  { value: 'bug', label: 'Something is broken' },
  { value: 'feature', label: 'Feature request' },
  { value: 'access', label: 'Access / permissions' },
  { value: 'other', label: 'Other' },
];

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/* ---------------------------------------------------------------- */
/*  HELP TAB                                                        */
/* ---------------------------------------------------------------- */
function HelpTab({ role }) {
  const items = FAQ_BY_ROLE[role] || FAQ_BY_ROLE.staff;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Frequently asked questions for your role ({role}). Tap any question to
        expand.
      </p>
      <Accordion type="single" collapsible className="w-full">
        {items.map((item, i) => (
          <AccordionItem key={i} value={`faq-${i}`}>
            <AccordionTrigger className="text-left text-sm py-3">
              {item.q}
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-3">
              {item.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  WHAT'S NEW TAB                                                  */
/* ---------------------------------------------------------------- */
function WhatsNewTab() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Recent updates to FOPS, newest first.
      </p>
      <ol className="relative border-l border-border pl-5 space-y-5">
        {CHANGELOG.map((entry, i) => (
          <li key={i} className="relative">
            <span
              aria-hidden
              className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-teal-600 ring-4 ring-background"
            />
            <div className="flex items-baseline gap-2 flex-wrap">
              <h4 className="text-sm font-semibold">{entry.title}</h4>
              <span className="text-[11px] text-muted-foreground">
                {formatDate(entry.date)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {entry.body}
            </p>
            {entry.tags?.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {entry.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  CONTACT TAB                                                     */
/* ---------------------------------------------------------------- */
function ContactTab({ user }) {
  const [category, setCategory] = useState('question');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error('Please fill in both the subject and the message.');
      return;
    }
    setSending(true);
    try {
      const res = await authedFetch('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, subject: subject.trim(), message: message.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.detail || `HTTP ${res.status}`);
      }
      setSentAt(new Date());
      setSubject('');
      setMessage('');
      toast.success('Message sent', {
        description: data?.mocked
          ? "We logged your message (no email key configured in this environment)."
          : "We'll get back to you as soon as we can.",
      });
    } catch (err) {
      toast.error("Couldn't send message", { description: err.message });
    } finally {
      setSending(false);
    }
  };

  if (sentAt) {
    return (
      <div className="py-8 text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-full bg-green-100 text-green-700 flex items-center justify-center">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold">Message sent</h3>
        <p className="text-sm text-muted-foreground">
          Thanks {user?.name?.split(' ')[0] || 'there'} — support will reply by
          email to <strong>{user?.email}</strong>.
        </p>
        <Button variant="outline" size="sm" onClick={() => setSentAt(null)}>
          Send another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Send a message straight to the FOPS support team. We&apos;ll reply by email.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="help-category">Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="help-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="help-subject">Subject</Label>
        <Input
          id="help-subject"
          maxLength={200}
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Briefly, what's it about?"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="help-message">Message</Label>
        <Textarea
          id="help-message"
          required
          rows={6}
          maxLength={5000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what's happening. Steps to reproduce, what you expected, what you saw..."
        />
        <div className="text-[10px] text-muted-foreground text-right">
          {message.length} / 5000
        </div>
      </div>

      <div className="rounded-md bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
        We&apos;ll see your name (<strong>{user?.name}</strong>), email (
        <strong>{user?.email}</strong>), and role (<strong>{user?.role}</strong>)
        attached automatically.
      </div>

      <Button type="submit" disabled={sending} className="w-full">
        {sending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" /> Send message
          </>
        )}
      </Button>
    </form>
  );
}

/* ---------------------------------------------------------------- */
/*  ROOT COMPONENT                                                  */
/* ---------------------------------------------------------------- */
export function HelpPanel({ user }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('help');

  const latestRelease = useMemo(() => CHANGELOG[0], []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open help"
          className={cn(
            'fixed bottom-5 right-5 z-40',
            'h-12 w-12 rounded-full bg-teal-600 text-white shadow-lg',
            'flex items-center justify-center',
            'hover:bg-teal-700 transition-colors',
            'focus:outline-none focus:ring-4 focus:ring-teal-500/30'
          )}
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-[320px] sm:w-[360px] p-0 flex flex-col"
      >
        <SheetHeader className="px-4 pt-4 pb-3 border-b">
          <SheetTitle className="text-base">Help &amp; Support</SheetTitle>
          <SheetDescription className="text-xs">
            FAQs, what&apos;s new, and a direct line to support.
          </SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-4 mt-3 grid grid-cols-3">
            <TabsTrigger value="help" className="text-xs gap-1">
              <HelpCircle className="h-3.5 w-3.5" /> Help
            </TabsTrigger>
            <TabsTrigger value="new" className="text-xs gap-1">
              <Sparkles className="h-3.5 w-3.5" /> What&apos;s new
            </TabsTrigger>
            <TabsTrigger value="contact" className="text-xs gap-1">
              <Mail className="h-3.5 w-3.5" /> Contact
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <TabsContent value="help" className="mt-0">
              <HelpTab role={user?.role || 'staff'} />
            </TabsContent>
            <TabsContent value="new" className="mt-0">
              <WhatsNewTab />
            </TabsContent>
            <TabsContent value="contact" className="mt-0">
              <ContactTab user={user} />
            </TabsContent>
          </div>

          {latestRelease && tab === 'help' && (
            <button
              type="button"
              onClick={() => setTab('new')}
              className="border-t px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                <span>New: {latestRelease.title}</span>
              </div>
            </button>
          )}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export default HelpPanel;
