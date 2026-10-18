-- A name to print on a certificate.
--
-- Until now the certificate printed user.email. Someone who had completed a paid programme
-- held a PDF with their email address written across the middle of it, which is not
-- something you show an employer, and quietly defeats the point of issuing one.
--
-- Nullable, and deliberately so: rows already exist, and a name is not worth refusing an
-- account over. Everything that prints a person falls back to the email until it is set.
ALTER TABLE "User" ADD COLUMN "fullName" TEXT;

-- Read on every person-facing surface -- a certificate, a giveaway winner, a roster row.
-- Not indexed: it is never searched on, and an index here would be cost for nothing.