# Shared memory code draft for NRF_RPC

```c++

void *shmem_ptr;

#define SLOT_EMPTY 0xFFFFFFFFuL
#define SLOT_PENDING 0xFFFFFFFEuL
#define SLOT_STATE_MAX 0xFFFFFFFDuL

typedef uint64_t mask_t;
#define MEM_BLOCKS 64

#define SHMEM_OUT_SIZE 1024
#define OUT_ENDPOINTS 13
#define MEM_OUT_ALLOCABLE (((SHMEM_OUT_SIZE - 4 * OUT_ENDPOINTS) / (4 * MEM_BLOCKS)) * (4 * MEM_BLOCKS))
#define MEM_OUT_BLOCK_SIZE (MEM_OUT_ALLOCABLE / MEM_BLOCKS)

static const uint8_t *out_allocable = shmem_ptr;
static const uint32_t *out_slots = (uint32_t *)&out_allocable[MEM_OUT_ALLOCABLE];

static mask_t free_mask = ~(mask_t)0;
static mask_t endpoint_mask[OUT_ENDPOINTS];

static struct k_mutex out_mutex;
static struct k_sem out_sem;


// allocate on output shared memory and mark slot as pending
uint8_t *out_shmem_alloc(struct nrf_rpc_tr_remote_ep *ep, size_t size)
{
	size_t i;
	size_t blocks = (size + 4 + MEM_OUT_BLOCK_SIZE - 1) / MEM_OUT_BLOCK_SIZE;
	uint32_t addr = ep->addr;
	bool sem_taken = false;
	mask_t sh_mask;

	if (blocks == 0 || blocks > MEM_BLOCKS) {
		return NULL;
	}

	// if this slot was not consumed yet wait for it
	while (out_slots[addr] <= SLOT_STATE_MAX) {
		k_sem_take(&out_sem);
		sem_taken = true;
	}

	k_mutex_lock(&out_mutex, K_FOREVER); // Maybe lock scheduler?

	// if this slot is empty or pending reclaim its memory
	free_mask ^= endpoint_mask[addr];
	endpoint_mask[addr] = 0;

	do {
		// create shifted mask with bits set where `blocks` can be allocated
		sh_mask = free_mask;
		for (i = 1; i < blocks; i++) {
			sh_mask &= (sh_mask >> 1);
		}

		// if no memory
		if (sh_mask == 0) {
			// wait for any slot to be empty
			k_mutex_unlock(&out_mutex);
			k_sem_take(&out_sem);
			sem_taken = true;
			k_mutex_lock(&out_mutex, K_FOREVER);
			// if any slot is empty reclaim its memory
			for (i = 0; i < OUT_ENDPOINTS; i++) {
				if (out_slots[i] == SLOT_EMPTY) {
					free_mask ^= endpoint_mask[i];
					endpoint_mask[i] = 0;
				}
			}
		}

	} while (sh_mask == 0);

	// get first available blocks
	size_t free_index = MASK_CTZ(sh_mask);
	// create bit mask with blocks that will be used
	mask_t mask = ((blocks == MEM_BLOCKS) ? ~(mask_t)0 : (((mask_t)1 << blocks) - 1)) << free_index;
	// update masks
	free_mask ^= mask;
	endpoint_mask[addr] = mask;
	// mark this slot as pending: memory cannot be reclaimed and remote side will not consume it
	out_slots[addr] = SLOT_PENDING;

	k_mutex_unlock(&out_mutex);
	
	// Give semaphore back, because there may be some other thread waiting
	if (sem_taken && free_mask != 0) {
		k_sem_give(&out_sem);
	}

	uint32_t *mem_start = (uint32_t *)&out_allocable[MEM_OUT_BLOCK_SIZE * free_index];

	mem_start[0] = size;

	return &mem_start[1];
}

// send allocated memory: set slot from pending to specific index
void out_shmem_send(struct nrf_rpc_tr_remote_ep *ep, uint8_t* buffer)
{
	out_slots[ep->addr] = buffer - 4 - out_allocable;
	remote_signal(ep->addr);
}

// discard allocated buffer without sending
void out_shmem_discard(struct nrf_rpc_tr_remote_ep *ep)
{
	out_slots[ep->addr] = SLOT_EMPTY;

	k_mutex_lock(&out_mutex, K_FOREVER); // Maybe lock scheduler?

	// reclaim its memory
	free_mask ^= endpoint_mask[ep->addr];
	endpoint_mask[ep->addr] = 0;

	k_mutex_unlock(&out_mutex);

	k_sem_give(&out_sem);
}

// receive data from input shared memory
int in_shmem_recv(struct nrf_rpc_tr_local_ep *ep, uint8_t **buf)
{
	uint32_t index = in_slots[ep->addr];

	if (index > SLOT_STATE_MAX) {
		return -EAGAIN;
	} else if (index > MEM_OUT_ALLOCABLE - 4) {
		return -EIO;
	}

	uint32_t *mem_start = (uint32_t *)&in_allocable[index];
	size_t size = mem_start[0];

	if (index + 4 + size > MEM_IN_ALLOCABLE) {
		in_shmem_consume(ep);
		return -EIO;
	}

	*buf = &mem_start[1];
	
	return size;
}

// consume incoming data i.e. mark slot as empty and signal remote about it
void in_shmem_consume(struct nrf_rpc_tr_local_ep *ep)
{
	out_slots[ep->addr] = SLOT_EMPTY;
	remote_signal(0xFF);
}


```
