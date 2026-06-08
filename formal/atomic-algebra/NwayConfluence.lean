/-
NwayConfluence.lean — Idea #1, the INDUCTION PRINCIPLE mechanized in Lean 4 (core only, no mathlib).

This closes the residual Z3 could not discharge (Z3 has no induction). The Z3 proof
(formal/atomic-algebra/nway_induction_z3.py) machine-checked the REDUCE + STEP lemmas; here Lean
machine-checks the INDUCTION itself: from the per-edit frame condition + the commute hypothesis
(every edit's mod-set is disjoint from the read-set R of the edit that reads R), the WHOLE merged
list preserves R's bytes — hence any verdict that depends only on R is preserved — for ALL N, by
induction on the edit list.

  Edit.frame : an edit changes nothing outside its mod-set.
  merge      : fold the edits left-to-right (application order).
  merge_preserves_read    : ∀ list, (∀ edit, mod ∩ R = ∅) → merge preserves bytes at R.   [induction]
  merge_preserves_verdict : a read-determined verdict, true before, stays true after the whole merge.

Verify:  ELAN_HOME=<repo>/.elan <repo>/.elan/bin/lean formal/atomic-algebra/NwayConfluence.lean
(exit 0, no errors = the theorem is machine-checked by Lean. Rice untouched: decidable abstract model.)
-/
namespace AtomicNway

structure Edit (Loc Byte : Type) where
  mod : Loc → Bool
  act : (Loc → Byte) → (Loc → Byte)
  frame : ∀ (s : Loc → Byte) (l : Loc), mod l = false → act s l = s l

variable {Loc Byte : Type}

def merge (es : List (Edit Loc Byte)) (s : Loc → Byte) : Loc → Byte :=
  es.foldl (fun st e => e.act st) s

theorem merge_preserves_read (R : Loc → Bool) :
    ∀ (es : List (Edit Loc Byte)),
      (∀ e ∈ es, ∀ l, R l = true → e.mod l = false) →
      ∀ (s : Loc → Byte) (l : Loc), R l = true → merge es s l = s l := by
  intro es
  induction es with
  | nil => intro _ s l _; rfl
  | cons e rest ih =>
    intro h s l hR
    have hrest : ∀ e' ∈ rest, ∀ l', R l' = true → e'.mod l' = false :=
      fun e' he' l' hl' => h e' (List.mem_cons.mpr (Or.inr he')) l' hl'
    have hstep : merge (e :: rest) s = merge rest (e.act s) := rfl
    rw [hstep, ih hrest (e.act s) l hR]
    exact e.frame s l (h e (List.mem_cons.mpr (Or.inl rfl)) l hR)

theorem merge_preserves_verdict (R : Loc → Bool) (verdict : (Loc → Byte) → Prop)
    (det : ∀ s s', (∀ l, R l = true → s l = s' l) → (verdict s ↔ verdict s'))
    (es : List (Edit Loc Byte))
    (h : ∀ e ∈ es, ∀ l, R l = true → e.mod l = false)
    (s : Loc → Byte) (hv : verdict s) :
    verdict (merge es s) :=
  (det s (merge es s) (fun l hl => (merge_preserves_read R es h s l hl).symm)).mp hv

end AtomicNway
