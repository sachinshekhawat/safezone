// Package sms delivers one-time passcodes to phone numbers.
//
// The interface exists so that the OTP handler never contains provider details.
// India-specific caveat: transactional SMS requires DLT registration (TRAI) with
// a pre-approved template and sender ID, so the production sender is expected to
// wrap a registered provider (MSG91, Gupshup, Kaleyra) rather than a raw gateway.
package sms

import (
	"context"
	"log"
)

// Sender delivers a verification code.
type Sender interface {
	// SendOTP delivers code to phone. Returning an error fails the request.
	SendOTP(ctx context.Context, phone, code string) error
	// Configured reports whether a real provider is wired up. When false the
	// API returns the code in its response so local development can proceed.
	Configured() bool
}

// LogSender writes codes to the server log instead of sending SMS.
//
// This is the development default. It is deliberately loud: a silent no-op
// sender is indistinguishable from a broken provider, and shipping one to
// production by accident would lock every user out.
type LogSender struct{}

// NewLogSender returns a Sender that logs codes.
func NewLogSender() *LogSender {
	log.Println("⚠️  SMS: no provider configured — OTPs will be logged, not sent. " +
		"Set SMS_PROVIDER before running anywhere real.")
	return &LogSender{}
}

// SendOTP logs the code.
func (s *LogSender) SendOTP(_ context.Context, phone, code string) error {
	log.Printf("📱 SMS (dev, not sent): %s -> code %s", phone, code)
	return nil
}

// Configured always reports false for the log sender.
func (s *LogSender) Configured() bool { return false }
