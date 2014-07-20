tinyqs
======

A small, embeddable, distributed and reliable message/task queue built on Redis and NodeJS



## Philosophy

tinyqs is an implementation of a common pattern found is software where large and/or complex tasks are sent to remote
workers for completion. Typically, the need to include this pattern in a system is "discovered" somewhere in the middle of
the development of the product and is often dictated by the need to speed up or relocate a piece of functionality or integrate
the actions of independently developed software. Whatever mechanism is chosen to solve this problem needs to make
some guarantees of performance, reliability, durability and maintainability. Most available solutions fall short in at least
one of these areas:

- **Relational Database** - Each task is represented as a row in a table. Usually each table row has a status column which
can double as a locking mechanism. Workers constantly poll the table looking for tasks with the status 'new' and then
reserve the task, complete it and report the result back, marking the status as 'complete'. This meets all of the
requirements of durability since the record is guaranteed to not *disappear*, but at a major performance and scalability
disadvantage. This approach is decent for small or long running workloads.
- **Messaging Systems** - Solutions like JGroups and Active/0MQ offer high performance at the cost of complexity and
durability. Developers considering this kind of system need to solve problems surrounding service discovery, network
capabilities, and how to handle backlogs of long running tasks. Integrating these solutions into an *existing* system can
also be difficult. In general though, these systems are a good choice for large-scale, low latency, high-performance systems
where the length of time required to complete a task is small and there are ample workers available to complete
assigned tasks.
- **Frameworks** - Frameworks like akka have this type of functionality baked-in, freeing the developer from having to
think much about it. They can be tuned to the task size and meet the middle ground between the messaging systems and
 relational databases. Their only drawback is the cost of integrating them into existing software (or rather, integrating
 existing software into them).

tinyqs hits the sweet spot between these alternatives. It handles the need for high performance by leveraging the
speed of NodeJS and redis. Durability is achieved through redis's persistence capabilities and list primitives. The
system is scalable because load can be partitioned between multiple redis and NodeJS instances. It's also a breeze to
integrate into existing software because it is based on a small number of commands and can either be included as a Javascript
module or accessed via TCP or REST APIs.

### What about resque, sidekiq, celery, beanstalkd ... ?

They're all great! In fact, tinyqs takes inspiration from many of these. A few design philosophies make tinyqs
a little different than these alternatives.

- **It's implemented in NodeJS** There are relatively few solutions in the NodeJS landscape compared to the many that are
available for Python and Ruby. NodeJS also brings some serious scalability to the table because it's event-driven.
- **It supports multiple APIs for ease of integration** Developers have a choice of binary integration and TCP/HTTP.
- **It is more primitive in many ways** tinyqs does not prescribe a message format or concept of priority. These are application
level concerns. At it's heart, tinyqs is simply permutations of three different fault tolerant actions - SEND, RECEIVE
and DELETE, with a little TOUCH thrown in to spice things up.

## Installation instructions

## Where to get help

## Contribution guidelines

## Contributor list

## Credits, Inspiration, Alternatives