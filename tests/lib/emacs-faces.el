;;; emacs-faces.el --- print the face runs of Carve documents  -*- lexical-binding: t; -*-

;; Fontify each document in a JSON file as Carve and print the runs of `face'
;; text property it carries.  ONE Emacs for a whole batch: the payload sweep
;; asks about thousands of documents, and a process per document is minutes of
;; process startup measuring nothing.
;;
;; PROTOCOL.  Called as
;;
;;     emacs -Q --batch -l carve-mode.el -l emacs-faces.el -- INPUT.json
;;
;; where INPUT.json is an array of strings, one document each.  Standard output
;; is an array of arrays of two-element [FACE, TEXT] pairs, in the same order,
;; where FACE is the face name or null.  JSON both ways so nothing has to agree
;; about escaping a newline or a quote - the documents are generated from an
;; alphabet that is mostly delimiters.  A file rather than standard input for
;; the same reason: batch Emacs reads stdin a line at a time and a document
;; here may hold a newline.
;;
;; The face is taken with `get-text-property' rather than `face-at-point',
;; because the question is what this mode PUT there, not what a theme resolves
;; it to.  A list-valued face - several overlapping faces on one run - is
;; joined, so a run carrying an italic face under a markup face reports both.

(require 'json)

(defun carve-faces--name (face)
  "FACE as a string, or nil when there is none."
  (cond
   ((null face) nil)
   ((symbolp face) (symbol-name face))
   ((consp face) (mapconcat (lambda (one) (or (carve-faces--name one) "")) face " "))
   (t (format "%s" face))))

(defun carve-faces--runs (source)
  "Fontify SOURCE as Carve, returning its face runs as a vector of [FACE TEXT]."
  (with-temp-buffer
    (insert source)
    (carve-mode)
    (font-lock-ensure)
    (let ((runs '())
          (at (point-min)))
      (while (< at (point-max))
        (let* ((face (get-text-property at 'face))
               (next (or (next-single-property-change at 'face) (point-max))))
          (push (vector (carve-faces--name face)
                        (buffer-substring-no-properties at next))
                runs)
          (setq at next)))
      (vconcat (nreverse runs)))))

(let* ((input (car (last command-line-args-left)))
       (documents (with-temp-buffer
                    (insert-file-contents input)
                    (json-parse-string (buffer-string) :array-type 'list))))
  (princ (json-encode (vconcat (mapcar #'carve-faces--runs documents)))))

;;; emacs-faces.el ends here
