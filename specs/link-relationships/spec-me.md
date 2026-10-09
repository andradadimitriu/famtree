add specs for a link to button. the link to button should live in the details, above the delete node. when pressed, it should show a drop down for  the relationship and a drop down for the node its being linked to. 

Types of relationship dropdown:
1. Child of 
2. Parent of
3. Spouse of


1. X Child of
- Parent 1, Parent 2 - optional(unknown)
a. if node X already has 2 parents - deny with instructions to first unlink at least one parent
b. if node X already has one parent - allow to choose only one other parent. based on this, create "marriage" between the 2 parents
c. if node X has no parent, allow to chose 2 parents, parent number 2 is optional(can be unknown)

2. X Parent of Y
choose node Y from dropdown of other nodes.
exclude nodes that already have 2 parents.
a. if node Y already has one parent, create a marriage between node X and the other parent
b. if node Y has no parents, create a new  marriage { spouse1Id: X, spouse2Id: null }


3. X spouse of Y
show a dropdown with only nodes that are not already married to X

If an existing incomplete marriage already has another child linked to it, create a new marriage for this parent pair instead of filling the gap — filling it would silently reassign that other child's second parent as a side effect, which the user never confirmed.

no cycle prevention 