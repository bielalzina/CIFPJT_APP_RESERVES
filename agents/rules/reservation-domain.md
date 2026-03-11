---
trigger: always_on
---

# Reservation Domain Rules

The system manages reservations of educational resources.

## Resource types

Resources include:

- classrooms
- auditorium
- laptop carts


## Time slots

Reservations have fixed duration:

1 hour per reservation.

Time slots:

08:00–09:00  
09:00–10:00  
10:00–11:00  
11:00–12:00  
12:00–13:00  
13:00–14:00  
14:00–15:00  

Reservations are allowed:

Monday to Friday.


## Space reservations

Rooms and spaces must be reserved entirely.

Partial reservations are not allowed.

If a space is reserved in a slot, it becomes unavailable for that entire slot.


## Laptop cart reservations

Laptop carts contain a fixed number of laptops.

Reservations may request a quantity of laptops.

Conditions:

0 < requested laptops ≤ total capacity.

Multiple reservations may exist in the same slot provided total reserved laptops do not exceed capacity.


## Authorization rules

Only teachers may create reservations.

Students and other staff members cannot create reservations.

Users may only modify or delete reservations they created.

Reservations in past time slots cannot be modified or deleted.


## Recurring restrictions

Resources may have recurring restrictions.

Example:

Every Wednesday  
Auditorium unavailable from 10:00 to 15:00.

Restrictions are permanent weekly rules.