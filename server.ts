import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  AppNotification,
  Booking,
  ChatMessage,
  LiveLocation,
  Review,
  Ride,
  RolePreference,
  RouteAlert,
  SosIncident,
  UserProfile,
} from './src/types.ts';
import { findIndiaCityCoords } from './src/lib/indiaCities.ts';

interface OtpChallenge {
  mobile: string;
  code: string;
  expiresAt: number;
  attempts: number;
}

interface SessionRecord {
  token: string;
  userId: string;
  createdAt: string;
}

interface StoredRide extends Omit<Ride, 'vehicleNumberFull'> {
  vehicleNumberFull: string;
}

interface StoredBooking {
  id: string;
  rideId: string;
  riderId: string;
  seatsBooked: number;
  originalPricePerSeat: number;
  currentOfferPerSeat: number;
  agreedPricePerSeat: number | null;
  offerProposedBy: 'rider' | 'driver' | null;
  routeProposal?: {
    pickupPoint: string;
    dropPoint: string;
    waypoints: string[];
    proposedBy: 'rider' | 'driver';
    agreed: boolean;
  };
  status: Booking['status'];
  paymentStatus: 'unpaid' | 'paid';
  paymentRef?: string;
  paidAt?: string;
  driverReviewedRider: boolean;
  riderReviewedDriver: boolean;
  createdAt: string;
}

interface DatabaseState {
  users: UserProfile[];
  rides: StoredRide[];
  bookings: StoredBooking[];
  messages: ChatMessage[];
  alerts: RouteAlert[];
  notifications: AppNotification[];
  reviews: Review[];
  sosIncidents: SosIncident[];
  sessions: SessionRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'safarpool-db.json');

function todayDatePlus(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function createInitialDb(): DatabaseState {
  const now = new Date().toISOString();
  const users: UserProfile[] = [
    {
      id: 'usr_rohan',
      mobile: '9823011223',
      name: 'Rohan Patil',
      rolePreference: 'both',
      driverRating: 4.9,
      driverReviewCount: 18,
      riderRating: 4.8,
      riderReviewCount: 6,
      emergencyContactName: 'Sneha Patil',
      emergencyContactMobile: '9823099881',
      createdAt: now,
    },
    {
      id: 'usr_aarti',
      mobile: '9765412390',
      name: 'Aarti Deshmukh',
      rolePreference: 'driver',
      driverRating: 4.8,
      driverReviewCount: 14,
      riderRating: 5.0,
      riderReviewCount: 3,
      emergencyContactName: 'Milind Deshmukh',
      emergencyContactMobile: '9765400112',
      createdAt: now,
    },
    {
      id: 'usr_vikram',
      mobile: '9922334455',
      name: 'Vikram Joshi',
      rolePreference: 'both',
      driverRating: 4.7,
      driverReviewCount: 9,
      riderRating: 4.9,
      riderReviewCount: 11,
      emergencyContactName: 'Prakash Joshi',
      emergencyContactMobile: '9922300101',
      createdAt: now,
    },
    {
      id: 'usr_neha',
      mobile: '9890123456',
      name: 'Neha Kulkarni',
      rolePreference: 'rider',
      driverRating: 0,
      driverReviewCount: 0,
      riderRating: 4.9,
      riderReviewCount: 12,
      emergencyContactName: 'Anil Kulkarni',
      emergencyContactMobile: '9890111222',
      createdAt: now,
    },
    {
      id: 'usr_arjun',
      mobile: '9811223344',
      name: 'Arjun Verma',
      rolePreference: 'driver',
      driverRating: 4.9,
      driverReviewCount: 22,
      riderRating: 4.8,
      riderReviewCount: 4,
      emergencyContactName: 'Kavita Verma',
      emergencyContactMobile: '9811001122',
      createdAt: now,
    },
    {
      id: 'usr_karthik',
      mobile: '9845098765',
      name: 'Karthik Rao',
      rolePreference: 'driver',
      driverRating: 4.8,
      driverReviewCount: 19,
      riderRating: 4.9,
      riderReviewCount: 5,
      emergencyContactName: 'Divya Rao',
      emergencyContactMobile: '9845011223',
      createdAt: now,
    },
    {
      id: 'usr_priya',
      mobile: '9830145678',
      name: 'Priya Chatterjee',
      rolePreference: 'both',
      driverRating: 4.9,
      driverReviewCount: 11,
      riderRating: 5.0,
      riderReviewCount: 8,
      emergencyContactName: 'Suman Chatterjee',
      emergencyContactMobile: '9830100999',
      createdAt: now,
    },
  ];

  const rides: StoredRide[] = [
    {
      id: 'ride_jal_pune_1',
      driverId: 'usr_rohan',
      driverName: 'Rohan Patil',
      driverRating: 4.9,
      driverReviewCount: 18,
      origin: 'Jalgaon',
      destination: 'Pune',
      pickupPoint: 'Ajanta Chowk, NH-753F, Jalgaon',
      dropPoint: 'Shivajinagar / Hinjewadi Phase 1, Pune',
      departureDate: todayDatePlus(0),
      departureTime: '06:30',
      totalSeats: 3,
      availableSeats: 3,
      basePricePerSeat: 850,
      minAcceptablePrice: 680,
      negotiable: true,
      vehicleModel: 'Honda City · Silver',
      vehicleNumberMasked: 'MH 19 •• 4567',
      vehicleNumberFull: 'MH 19 FY 4567',
      waypoints: ['Jalgaon', 'Chalisgaon', 'Chhatrapati Sambhajinagar', 'Ahilyanagar', 'Pune'],
      distanceKm: 395,
      estimatedDuration: '7h 20m',
      status: 'scheduled',
      liveLocation: {
        lat: 21.0077,
        lng: 75.5626,
        progressPct: 0,
        currentCity: 'Jalgaon',
        speedKmh: 0,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: 'ride_del_jai_1',
      driverId: 'usr_arjun',
      driverName: 'Arjun Verma',
      driverRating: 4.9,
      driverReviewCount: 22,
      origin: 'New Delhi',
      destination: 'Jaipur',
      pickupPoint: 'Dhaula Kuan Metro / IFFCO Chowk, NH-48',
      dropPoint: 'Sindhi Camp / Mansarovar, Jaipur',
      departureDate: todayDatePlus(0),
      departureTime: '07:15',
      totalSeats: 3,
      availableSeats: 3,
      basePricePerSeat: 680,
      minAcceptablePrice: 550,
      negotiable: true,
      vehicleModel: 'Hyundai Verna · White',
      vehicleNumberMasked: 'DL 08 •• 7214',
      vehicleNumberFull: 'DL 08 CA 7214',
      waypoints: ['New Delhi', 'Gurugram', 'Neemrana', 'Kotputli', 'Jaipur'],
      distanceKm: 278,
      estimatedDuration: '4h 50m',
      status: 'scheduled',
      liveLocation: {
        lat: 28.6139,
        lng: 77.209,
        progressPct: 0,
        currentCity: 'New Delhi',
        speedKmh: 0,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: 'ride_blr_mys_1',
      driverId: 'usr_karthik',
      driverName: 'Karthik Rao',
      driverRating: 4.8,
      driverReviewCount: 19,
      origin: 'Bengaluru',
      destination: 'Mysuru',
      pickupPoint: 'Kengeri Satellite Bus Stand, Bengaluru',
      dropPoint: 'Suburban Bus Terminal / Vijayanagar, Mysuru',
      departureDate: todayDatePlus(0),
      departureTime: '08:30',
      totalSeats: 3,
      availableSeats: 3,
      basePricePerSeat: 420,
      minAcceptablePrice: 340,
      negotiable: true,
      vehicleModel: 'Tata Nexon · Blue',
      vehicleNumberMasked: 'KA 05 •• 5590',
      vehicleNumberFull: 'KA 05 MN 5590',
      waypoints: ['Bengaluru', 'Ramanagara', 'Channapatna', 'Mandya', 'Mysuru'],
      distanceKm: 145,
      estimatedDuration: '2h 40m',
      status: 'scheduled',
      liveLocation: {
        lat: 12.9716,
        lng: 77.5946,
        progressPct: 0,
        currentCity: 'Bengaluru',
        speedKmh: 0,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: 'ride_bom_sur_1',
      driverId: 'usr_vikram',
      driverName: 'Vikram Joshi',
      driverRating: 4.7,
      driverReviewCount: 9,
      origin: 'Mumbai',
      destination: 'Surat',
      pickupPoint: 'Borivali National Park Gate, Mumbai',
      dropPoint: 'Vesu / Athwa Gate, Surat',
      departureDate: todayDatePlus(0),
      departureTime: '09:00',
      totalSeats: 4,
      availableSeats: 3,
      basePricePerSeat: 690,
      minAcceptablePrice: 560,
      negotiable: true,
      vehicleModel: 'Kia Seltos · Steel Gray',
      vehicleNumberMasked: 'MH 02 •• 4410',
      vehicleNumberFull: 'MH 02 ER 4410',
      waypoints: ['Mumbai', 'Vapi', 'Valsad', 'Navsari', 'Surat'],
      distanceKm: 282,
      estimatedDuration: '5h 10m',
      status: 'scheduled',
      liveLocation: {
        lat: 19.076,
        lng: 72.8777,
        progressPct: 0,
        currentCity: 'Mumbai',
        speedKmh: 0,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: 'ride_hyd_vja_1',
      driverId: 'usr_karthik',
      driverName: 'Karthik Rao',
      driverRating: 4.8,
      driverReviewCount: 19,
      origin: 'Hyderabad',
      destination: 'Vijayawada',
      pickupPoint: 'LB Nagar Ring Road, Hyderabad',
      dropPoint: 'Benz Circle, Vijayawada',
      departureDate: todayDatePlus(1),
      departureTime: '06:45',
      totalSeats: 3,
      availableSeats: 3,
      basePricePerSeat: 720,
      minAcceptablePrice: 590,
      negotiable: true,
      vehicleModel: 'Toyota Innova Crysta · Silver',
      vehicleNumberMasked: 'TS 09 •• 9012',
      vehicleNumberFull: 'TS 09 UB 9012',
      waypoints: ['Hyderabad', 'Choutuppal', 'Suryapet', 'Kodad', 'Vijayawada'],
      distanceKm: 275,
      estimatedDuration: '4h 55m',
      status: 'scheduled',
      liveLocation: {
        lat: 17.385,
        lng: 78.4867,
        progressPct: 0,
        currentCity: 'Hyderabad',
        speedKmh: 0,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: 'ride_ccu_slg_1',
      driverId: 'usr_priya',
      driverName: 'Priya Chatterjee',
      driverRating: 4.9,
      driverReviewCount: 11,
      origin: 'Kolkata',
      destination: 'Siliguri',
      pickupPoint: 'Dankuni Toll Plaza, NH-19, Kolkata',
      dropPoint: 'Sevoke Road / Junction, Siliguri',
      departureDate: todayDatePlus(1),
      departureTime: '05:30',
      totalSeats: 3,
      availableSeats: 3,
      basePricePerSeat: 1150,
      minAcceptablePrice: 950,
      negotiable: true,
      vehicleModel: 'Maruti Brezza · Red',
      vehicleNumberMasked: 'WB 06 •• 6381',
      vehicleNumberFull: 'WB 06 T 6381',
      waypoints: ['Kolkata', 'Bardhaman', 'Farakka', 'Malda', 'Siliguri'],
      distanceKm: 560,
      estimatedDuration: '10h 30m',
      status: 'scheduled',
      liveLocation: {
        lat: 22.5726,
        lng: 88.3639,
        progressPct: 0,
        currentCity: 'Kolkata',
        speedKmh: 0,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: 'ride_jal_pune_2',
      driverId: 'usr_aarti',
      driverName: 'Aarti Deshmukh',
      driverRating: 4.8,
      driverReviewCount: 14,
      origin: 'Jalgaon',
      destination: 'Pune',
      pickupPoint: 'Akashwani Chowk, Jalgaon',
      dropPoint: 'Viman Nagar / Kharadi Bypass, Pune',
      departureDate: todayDatePlus(0),
      departureTime: '14:00',
      totalSeats: 4,
      availableSeats: 4,
      basePricePerSeat: 780,
      minAcceptablePrice: 650,
      negotiable: true,
      vehicleModel: 'Maruti Ertiga · Pearl White',
      vehicleNumberMasked: 'MH 19 •• 8821',
      vehicleNumberFull: 'MH 19 DQ 8821',
      waypoints: ['Jalgaon', 'Chalisgaon', 'Chhatrapati Sambhajinagar', 'Ahilyanagar', 'Pune'],
      distanceKm: 392,
      estimatedDuration: '7h 30m',
      status: 'scheduled',
      liveLocation: {
        lat: 21.0077,
        lng: 75.5626,
        progressPct: 0,
        currentCity: 'Jalgaon',
        speedKmh: 0,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: 'ride_maa_cbe_1',
      driverId: 'usr_karthik',
      driverName: 'Karthik Rao',
      driverRating: 4.8,
      driverReviewCount: 19,
      origin: 'Chennai',
      destination: 'Coimbatore',
      pickupPoint: 'Koyambedu / Sriperumbudur Toll, Chennai',
      dropPoint: 'Gandhipuram / Avinashi Road, Coimbatore',
      departureDate: todayDatePlus(1),
      departureTime: '06:00',
      totalSeats: 3,
      availableSeats: 3,
      basePricePerSeat: 960,
      minAcceptablePrice: 800,
      negotiable: true,
      vehicleModel: 'Honda Elevate · White',
      vehicleNumberMasked: 'TN 09 •• 3120',
      vehicleNumberFull: 'TN 09 CK 3120',
      waypoints: ['Chennai', 'Vellore', 'Krishnagiri', 'Salem', 'Coimbatore'],
      distanceKm: 505,
      estimatedDuration: '8h 40m',
      status: 'scheduled',
      liveLocation: {
        lat: 13.0827,
        lng: 80.2707,
        progressPct: 0,
        currentCity: 'Chennai',
        speedKmh: 0,
        updatedAt: now,
      },
      createdAt: now,
    },
  ];

  const reviews: Review[] = [
    {
      id: 'rev_seed_1',
      bookingId: 'bk_seed_1',
      rideId: 'ride_jal_pune_1',
      fromUserId: 'usr_neha',
      fromUserName: 'Neha Kulkarni',
      toUserId: 'usr_rohan',
      toRole: 'driver',
      rating: 5,
      tags: ['Punctual', 'Safe Driving', 'Clean Cabin'],
      comment: 'Smooth highway drive from Ajanta Chowk to Shivajinagar. Agreed fairly on ₹780/seat in chat.',
      createdAt: now,
    },
    {
      id: 'rev_seed_2',
      bookingId: 'bk_seed_1',
      rideId: 'ride_jal_pune_1',
      fromUserId: 'usr_rohan',
      fromUserName: 'Rohan Patil',
      toUserId: 'usr_neha',
      toRole: 'rider',
      rating: 5,
      tags: ['On Time', 'Courteous', 'Smooth Pickup'],
      comment: 'Reached pickup point 5 minutes early and completed checkout smoothly.',
      createdAt: now,
    },
    {
      id: 'rev_seed_3',
      bookingId: 'bk_seed_2',
      rideId: 'ride_del_jai_1',
      fromUserId: 'usr_priya',
      fromUserName: 'Priya Chatterjee',
      toUserId: 'usr_arjun',
      toRole: 'driver',
      rating: 5,
      tags: ['Punctual', 'Fair Price', 'Clean Cabin'],
      comment: 'Great NH-48 ride from Delhi to Jaipur. Negotiated ₹600/seat and got driver contact right after checkout.',
      createdAt: now,
    },
  ];

  return {
    users,
    rides,
    bookings: [],
    messages: [],
    alerts: [],
    notifications: [],
    reviews,
    sosIncidents: [],
    sessions: [],
  };
}

function loadDb(): DatabaseState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const initial = createInitialDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as DatabaseState;
    if (parsed.rides.length <= 4 && parsed.bookings.length === 0) {
      const fresh = createInitialDb();
      fs.writeFileSync(DB_PATH, JSON.stringify(fresh, null, 2), 'utf8');
      return fresh;
    }
    return parsed;
  } catch {
    const initial = createInitialDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
}

const db: DatabaseState = loadDb();
const otpStore = new Map<string, OtpChallenge>();

function saveDb(): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function computeFees(pricePerSeat: number, seats: number) {
  const rideSubtotal = Math.round(pricePerSeat * seats * 100) / 100;
  const platformFee = Math.round(rideSubtotal * 0.015 * 100) / 100;
  const totalPayable = Math.round((rideSubtotal + platformFee) * 100) / 100;
  return { rideSubtotal, platformFee, totalPayable };
}

function maskVehicleNumber(plate: string): string {
  const clean = plate.trim().toUpperCase();
  const parts = clean.split(/\s+/);
  if (parts.length >= 4) {
    return `${parts[0]} ${parts[1]} •• ${parts[parts.length - 1]}`;
  }
  if (clean.length > 4) {
    return `${clean.slice(0, 4)} •• ${clean.slice(-4)}`;
  }
  return 'MH •• ••••';
}

function toPublicRide(ride: StoredRide): Ride {
  const driver = db.users.find((u) => u.id === ride.driverId);
  const { vehicleNumberFull: _hidden, ...rest } = ride;
  return {
    ...rest,
    vehicleModel: ride.vehicleModel,
    vehicleNumberMasked: '•• •• ••••',
    driverRating: driver ? driver.driverRating : ride.driverRating,
    driverReviewCount: driver ? driver.driverReviewCount : ride.driverReviewCount,
  };
}

function toHydratedBooking(booking: StoredBooking, viewerId: string): Booking {
  const ride = db.rides.find((r) => r.id === booking.rideId);
  const driver = db.users.find((u) => u.id === ride?.driverId);
  const rider = db.users.find((u) => u.id === booking.riderId);
  const effectivePrice = booking.agreedPricePerSeat ?? booking.currentOfferPerSeat;
  const { rideSubtotal, platformFee, totalPayable } = computeFees(effectivePrice, booking.seatsBooked);
  const isParticipant = viewerId === booking.riderId || viewerId === ride?.driverId;
  const isPaid = booking.paymentStatus === 'paid';

  return {
    id: booking.id,
    rideId: booking.rideId,
    rideOrigin: ride?.origin ?? 'Unknown',
    rideDestination: ride?.destination ?? 'Unknown',
    rideDepartureDate: ride?.departureDate ?? '',
    rideDepartureTime: ride?.departureTime ?? '',
    ridePickupPoint: booking.routeProposal?.agreed ? booking.routeProposal.pickupPoint : (ride?.pickupPoint ?? ''),
    rideDropPoint: booking.routeProposal?.agreed ? booking.routeProposal.dropPoint : (ride?.dropPoint ?? ''),
    rideVehicleModel: ride?.vehicleModel ?? '',
    rideVehicleNumberMasked: isPaid && isParticipant ? (ride?.vehicleNumberMasked ?? '') : '•• •• ••••',
    rideVehicleNumberFull: isPaid && isParticipant ? ride?.vehicleNumberFull : undefined,
    rideStatus: ride?.status ?? 'scheduled',
    rideLiveLocation: ride?.liveLocation,
    rideWaypoints: booking.routeProposal?.agreed ? booking.routeProposal.waypoints : (ride?.waypoints ?? []),
    rideDistanceKm: ride?.distanceKm ?? 300,
    driverId: ride?.driverId ?? '',
    driverName: driver?.name ?? ride?.driverName ?? 'Driver',
    driverRating: driver?.driverRating ?? ride?.driverRating ?? 0,
    driverReviewCount: driver?.driverReviewCount ?? ride?.driverReviewCount ?? 0,
    riderId: booking.riderId,
    riderName: rider?.name ?? 'Rider',
    riderRating: rider?.riderRating ?? 0,
    riderReviewCount: rider?.riderReviewCount ?? 0,
    seatsBooked: booking.seatsBooked,
    originalPricePerSeat: booking.originalPricePerSeat,
    currentOfferPerSeat: booking.currentOfferPerSeat,
    agreedPricePerSeat: booking.agreedPricePerSeat,
    offerProposedBy: booking.offerProposedBy,
    routeProposal: booking.routeProposal ?? {
      pickupPoint: ride?.pickupPoint ?? '',
      dropPoint: ride?.dropPoint ?? '',
      waypoints: ride?.waypoints ?? [],
      proposedBy: 'driver',
      agreed: true,
    },
    rideSubtotal,
    platformFee,
    totalPayable,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    paymentRef: booking.paymentRef,
    paidAt: booking.paidAt,
    driverContactUnlocked: isPaid,
    riderContactUnlocked: isPaid,
    driverMobile: isPaid && isParticipant ? driver?.mobile : undefined,
    riderMobile: isPaid && isParticipant ? rider?.mobile : undefined,
    driverReviewedRider: booking.driverReviewedRider,
    riderReviewedDriver: booking.riderReviewedDriver,
    createdAt: booking.createdAt,
  };
}

function getCityCoords(city: string): { lat: number; lng: number } {
  return findIndiaCityCoords(city);
}

const KNOWN_INDIA_CORRIDORS: Array<{
  a: string;
  b: string;
  km: number;
  duration: string;
  waypoints: string[];
}> = [
  {
    a: 'jalgaon',
    b: 'pune',
    km: 395,
    duration: '7h 20m',
    waypoints: ['Jalgaon', 'Chalisgaon', 'Chhatrapati Sambhajinagar', 'Ahilyanagar', 'Pune'],
  },
  {
    a: 'nashik',
    b: 'pune',
    km: 212,
    duration: '4h 30m',
    waypoints: ['Nashik', 'Sangamner', 'Narayangaon', 'Chakan', 'Pune'],
  },
  {
    a: 'new delhi',
    b: 'jaipur',
    km: 278,
    duration: '4h 50m',
    waypoints: ['New Delhi', 'Gurugram', 'Neemrana', 'Kotputli', 'Jaipur'],
  },
  {
    a: 'delhi',
    b: 'jaipur',
    km: 278,
    duration: '4h 50m',
    waypoints: ['Delhi', 'Gurugram', 'Neemrana', 'Kotputli', 'Jaipur'],
  },
  {
    a: 'bengaluru',
    b: 'mysuru',
    km: 145,
    duration: '2h 40m',
    waypoints: ['Bengaluru', 'Ramanagara', 'Channapatna', 'Mandya', 'Mysuru'],
  },
  {
    a: 'mumbai',
    b: 'surat',
    km: 282,
    duration: '5h 10m',
    waypoints: ['Mumbai', 'Vapi', 'Valsad', 'Navsari', 'Surat'],
  },
  {
    a: 'mumbai',
    b: 'pune',
    km: 150,
    duration: '2h 55m',
    waypoints: ['Mumbai', 'Panvel', 'Lonavala', 'Talegaon', 'Pune'],
  },
  {
    a: 'hyderabad',
    b: 'vijayawada',
    km: 275,
    duration: '4h 55m',
    waypoints: ['Hyderabad', 'Choutuppal', 'Suryapet', 'Kodad', 'Vijayawada'],
  },
  {
    a: 'chennai',
    b: 'coimbatore',
    km: 505,
    duration: '8h 40m',
    waypoints: ['Chennai', 'Vellore', 'Krishnagiri', 'Salem', 'Coimbatore'],
  },
  {
    a: 'kolkata',
    b: 'siliguri',
    km: 560,
    duration: '10h 30m',
    waypoints: ['Kolkata', 'Bardhaman', 'Farakka', 'Malda', 'Siliguri'],
  },
  {
    a: 'ahmedabad',
    b: 'udaipur',
    km: 262,
    duration: '4h 40m',
    waypoints: ['Ahmedabad', 'Himmatnagar', 'Shamlaji', 'Kherwara', 'Udaipur'],
  },
  {
    a: 'lucknow',
    b: 'varanasi',
    km: 315,
    duration: '5h 45m',
    waypoints: ['Lucknow', 'Raebareli', 'Pratapgarh', 'Jaunpur', 'Varanasi'],
  },
  {
    a: 'bhopal',
    b: 'indore',
    km: 195,
    duration: '3h 30m',
    waypoints: ['Bhopal', 'Sehore', 'Ashta', 'Dewas', 'Indore'],
  },
];

function estimateRouteDistanceKm(origin: string, destination: string): { km: number; duration: string; waypoints: string[] } {
  const o = origin.trim().toLowerCase();
  const d = destination.trim().toLowerCase();

  for (const corridor of KNOWN_INDIA_CORRIDORS) {
    if (o === corridor.a && d === corridor.b) {
      return { km: corridor.km, duration: corridor.duration, waypoints: corridor.waypoints };
    }
    if (o === corridor.b && d === corridor.a) {
      return { km: corridor.km, duration: corridor.duration, waypoints: [...corridor.waypoints].reverse() };
    }
  }

  const c1 = getCityCoords(origin);
  const c2 = getCityCoords(destination);
  const dLat = ((c2.lat - c1.lat) * Math.PI) / 180;
  const dLng = ((c2.lng - c1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((c1.lat * Math.PI) / 180) * Math.cos((c2.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const straightKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const roadKm = Math.max(45, Math.round(straightKm * 1.24));
  const hours = Math.floor(roadKm / 55);
  const mins = Math.round(((roadKm / 55) - hours) * 60);
  return {
    km: roadKm,
    duration: `${hours}h ${mins}m`,
    waypoints: [origin.trim(), 'Highway En Route', destination.trim()],
  };
}

function inspectChatMessageForSafety(
  text: string,
  paymentStatus: 'unpaid' | 'paid'
): { allowed: boolean; sanitizedText: string; flaggedReason?: string } {
  const normalized = text.trim();
  if (!normalized) {
    return { allowed: false, sanitizedText: '', flaggedReason: 'Empty message' };
  }

  const abusivePattern = /\b(scam|cheat|idiot|stupid|fraud|abuse|threat)\b/i;
  if (abusivePattern.test(normalized)) {
    return {
      allowed: false,
      sanitizedText: normalized,
      flaggedReason: 'Respectful communication policy: please keep negotiation courteous.',
    };
  }

  if (paymentStatus === 'unpaid') {
    const phonePattern = /(?:\+?91[\s-]*)?[6-9](?:[\s.-]*\d){9}/;
    const digitRunPattern = /\d[\s.-]*\d[\s.-]*\d[\s.-]*\d[\s.-]*\d[\s.-]*\d[\s.-]*\d/;
    const aadhaarPattern = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/;
    const panPattern = /\b[A-Z]{5}\d{4}[A-Z]\b/i;
    const plateOrDlPattern = /\b[A-Z]{2}[\s-]*\d{1,2}[\s-]*[A-Z]{1,3}[\s-]*\d{3,4}\b/i;
    const docKeywordPattern =
      /\b(aadhaar|aadhar|pan card|driving licen[cs]e|dl no|passport|voter id|rc book|id proof|personal document)\b/i;
    const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
    const upiOrSocialPattern = /(@ybl|@okaxis|@okicici|@paytm|@upi|whatsapp|telegram|call me directly|pay cash outside)/i;

    if (
      phonePattern.test(normalized) ||
      digitRunPattern.test(normalized) ||
      aadhaarPattern.test(normalized) ||
      panPattern.test(normalized) ||
      plateOrDlPattern.test(normalized) ||
      docKeywordPattern.test(normalized) ||
      emailPattern.test(normalized) ||
      upiOrSocialPattern.test(normalized)
    ) {
      return {
        allowed: false,
        sanitizedText: normalized,
        flaggedReason:
          'Personal documents (Aadhaar, PAN, DL, ID proofs), contact numbers, registration plates, and off-platform payment links cannot be shared in chat before payment. Discuss only route and fare here; contact numbers and full details unlock after paying ride + 1.5% platform fees.',
      };
    }
  }

  return { allowed: true, sanitizedText: normalized };
}

// WebSocket hub
interface WsClient {
  ws: WebSocket;
  userId: string | null;
  bookingRooms: Set<string>;
  rideRooms: Set<string>;
}

const wsClients = new Set<WsClient>();

function sendWs(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastToUser(userId: string, payload: unknown): void {
  for (const client of wsClients) {
    if (client.userId === userId) {
      sendWs(client.ws, payload);
    }
  }
}

function broadcastToBooking(bookingId: string, payloadBuilder: (viewerId: string) => unknown): void {
  const booking = db.bookings.find((b) => b.id === bookingId);
  const ride = booking ? db.rides.find((r) => r.id === booking.rideId) : undefined;
  for (const client of wsClients) {
    if (!client.userId) continue;
    const isParticipant = client.userId === booking?.riderId || client.userId === ride?.driverId;
    if (isParticipant || client.bookingRooms.has(bookingId)) {
      sendWs(client.ws, payloadBuilder(client.userId));
    }
  }
}

function broadcastToAll(payload: unknown): void {
  for (const client of wsClients) {
    sendWs(client.ws, payload);
  }
}

function pushNotification(params: Omit<AppNotification, 'id' | 'read' | 'createdAt'>): AppNotification {
  const notification: AppNotification = {
    id: `ntf_${crypto.randomUUID().slice(0, 8)}`,
    read: false,
    createdAt: new Date().toISOString(),
    ...params,
  };
  db.notifications.unshift(notification);
  if (db.notifications.length > 300) {
    db.notifications = db.notifications.slice(0, 300);
  }
  saveDb();
  broadcastToUser(notification.userId, { type: 'notification:new', notification });
  return notification;
}

function resolveAuthUser(req: express.Request): UserProfile | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const session = db.sessions.find((s) => s.token === token);
  if (!session) return null;
  return db.users.find((u) => u.id === session.userId) ?? null;
}

function requireAuth(req: express.Request, res: express.Response): UserProfile | null {
  const user = resolveAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Mobile OTP sign-in is required to perform this action.' });
    return null;
  }
  return user;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // --- Auth: Mandatory Mobile Number + OTP ---
  app.post('/api/auth/request-otp', (req, res) => {
    const rawMobile = String(req.body?.mobile ?? '').replace(/\D/g, '');
    const mobile = rawMobile.length === 12 && rawMobile.startsWith('91') ? rawMobile.slice(2) : rawMobile;
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number starting with 6-9.' });
      return;
    }

    const existing = db.users.find((u) => u.mobile === mobile);
    const code = String(crypto.randomInt(100000, 999999));
    otpStore.set(mobile, {
      mobile,
      code,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    });

    res.json({
      success: true,
      mobile,
      isNewUser: !existing,
      existingName: existing?.name ?? null,
      expiresInSeconds: 300,
      otpPreview: code,
    });
  });

  app.post('/api/auth/verify-otp', (req, res) => {
    const rawMobile = String(req.body?.mobile ?? '').replace(/\D/g, '');
    const mobile = rawMobile.length === 12 && rawMobile.startsWith('91') ? rawMobile.slice(2) : rawMobile;
    const otp = String(req.body?.otp ?? '').trim();
    const name = String(req.body?.name ?? '').trim();
    const rolePreference = (req.body?.rolePreference ?? 'both') as RolePreference;
    const emergencyContactName = String(req.body?.emergencyContactName ?? '').trim();
    const emergencyContactMobile = String(req.body?.emergencyContactMobile ?? '').replace(/\D/g, '');

    const challenge = otpStore.get(mobile);
    if (!challenge) {
      res.status(400).json({ error: 'No active OTP found for this mobile number. Please request a new OTP.' });
      return;
    }
    if (Date.now() > challenge.expiresAt) {
      otpStore.delete(mobile);
      res.status(400).json({ error: 'OTP has expired. Please request a fresh OTP.' });
      return;
    }
    challenge.attempts += 1;
    if (challenge.attempts > 5) {
      otpStore.delete(mobile);
      res.status(429).json({ error: 'Too many invalid attempts. Request a new OTP.' });
      return;
    }
    if (challenge.code !== otp) {
      res.status(400).json({ error: 'Invalid 6-digit OTP code. Please check and try again.' });
      return;
    }

    otpStore.delete(mobile);

    let user = db.users.find((u) => u.mobile === mobile);
    if (!user) {
      if (!name || name.length < 2) {
        res.status(400).json({ error: 'Please enter your full name to complete registration.' });
        return;
      }
      user = {
        id: `usr_${crypto.randomUUID().slice(0, 8)}`,
        mobile,
        name,
        rolePreference: ['rider', 'driver', 'both'].includes(rolePreference) ? rolePreference : 'both',
        driverRating: 0,
        driverReviewCount: 0,
        riderRating: 0,
        riderReviewCount: 0,
        emergencyContactName: emergencyContactName || 'Family Safety Contact',
        emergencyContactMobile: emergencyContactMobile || '112',
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
    }

    const token = crypto.randomBytes(24).toString('hex');
    db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
    saveDb();

    res.json({ token, user });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = resolveAuthUser(req);
    if (!user) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    res.json({ user });
  });

  app.put('/api/auth/profile', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const name = String(req.body?.name ?? '').trim();
    const rolePreference = req.body?.rolePreference as RolePreference | undefined;
    const emergencyContactName = String(req.body?.emergencyContactName ?? '').trim();
    const emergencyContactMobile = String(req.body?.emergencyContactMobile ?? '').trim();

    if (name.length >= 2) user.name = name;
    if (rolePreference && ['rider', 'driver', 'both'].includes(rolePreference)) {
      user.rolePreference = rolePreference;
    }
    if (emergencyContactName) user.emergencyContactName = emergencyContactName;
    if (emergencyContactMobile) user.emergencyContactMobile = emergencyContactMobile;

    saveDb();
    res.json({ user });
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      db.sessions = db.sessions.filter((s) => s.token !== token);
      saveDb();
    }
    res.json({ success: true });
  });

  // --- Rides ---
  app.get('/api/rides', (req, res) => {
    const origin = String(req.query.origin ?? '').trim().toLowerCase();
    const destination = String(req.query.destination ?? '').trim().toLowerCase();
    const minSeats = Number(req.query.minSeats ?? 1);
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : null;
    const date = String(req.query.date ?? '').trim();

    const list = db.rides
      .filter((r) => {
        if (r.status === 'cancelled' || r.status === 'completed') return false;
        if (origin && !r.origin.toLowerCase().includes(origin)) return false;
        if (destination && !r.destination.toLowerCase().includes(destination)) return false;
        if (!Number.isNaN(minSeats) && r.availableSeats < minSeats) return false;
        if (maxPrice !== null && !Number.isNaN(maxPrice) && r.basePricePerSeat > maxPrice) return false;
        if (date && r.departureDate !== date) return false;
        return true;
      })
      .map(toPublicRide);

    res.json({ rides: list });
  });

  app.post('/api/rides', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const origin = String(req.body?.origin ?? '').trim();
    const destination = String(req.body?.destination ?? '').trim();
    const pickupPoint = String(req.body?.pickupPoint ?? '').trim();
    const dropPoint = String(req.body?.dropPoint ?? '').trim();
    const departureDate = String(req.body?.departureDate ?? todayDatePlus(0)).trim();
    const departureTime = String(req.body?.departureTime ?? '08:00').trim();
    const totalSeats = Math.min(6, Math.max(1, Number(req.body?.totalSeats ?? 3)));
    const basePricePerSeat = Math.max(50, Math.round(Number(req.body?.basePricePerSeat ?? 500)));
    const negotiable = Boolean(req.body?.negotiable ?? true);
    const minAcceptablePrice = negotiable
      ? Math.max(50, Math.min(basePricePerSeat, Math.round(Number(req.body?.minAcceptablePrice ?? basePricePerSeat * 0.75))))
      : basePricePerSeat;
    const vehicleModel = String(req.body?.vehicleModel ?? '').trim();
    const vehicleNumberFull = String(req.body?.vehicleNumber ?? '').trim().toUpperCase();

    if (!origin || !destination || !pickupPoint || !dropPoint || !vehicleModel || !vehicleNumberFull) {
      res.status(400).json({ error: 'Please complete origin, destination, pickup/drop points, vehicle model, and plate number.' });
      return;
    }

    const routeMeta = estimateRouteDistanceKm(origin, destination);
    const customWaypointsRaw = Array.isArray(req.body?.waypoints)
      ? req.body.waypoints.map((w: unknown) => String(w).trim()).filter(Boolean)
      : [];
    const customWaypoints =
      customWaypointsRaw.length > 0
        ? [
            origin,
            ...customWaypointsRaw.filter(
              (w: string) => w.toLowerCase() !== origin.toLowerCase() && w.toLowerCase() !== destination.toLowerCase()
            ),
            destination,
          ]
        : routeMeta.waypoints;

    const startCoords = getCityCoords(origin);
    const now = new Date().toISOString();

    const newRide: StoredRide = {
      id: `ride_${crypto.randomUUID().slice(0, 8)}`,
      driverId: user.id,
      driverName: user.name,
      driverRating: user.driverRating,
      driverReviewCount: user.driverReviewCount,
      origin,
      destination,
      pickupPoint,
      dropPoint,
      departureDate,
      departureTime,
      totalSeats,
      availableSeats: totalSeats,
      basePricePerSeat,
      minAcceptablePrice,
      negotiable,
      vehicleModel,
      vehicleNumberMasked: maskVehicleNumber(vehicleNumberFull),
      vehicleNumberFull,
      waypoints: customWaypoints,
      distanceKm: routeMeta.km,
      estimatedDuration: routeMeta.duration,
      status: 'scheduled',
      liveLocation: {
        lat: startCoords.lat,
        lng: startCoords.lng,
        progressPct: 0,
        currentCity: origin,
        speedKmh: 0,
        updatedAt: now,
      },
      createdAt: now,
    };

    db.rides.unshift(newRide);

    // Automated Route Alert Notification System
    const matchingAlerts = db.alerts.filter(
      (alert) =>
        alert.active &&
        alert.userId !== user.id &&
        alert.origin.trim().toLowerCase() === origin.toLowerCase() &&
        alert.destination.trim().toLowerCase() === destination.toLowerCase() &&
        newRide.availableSeats >= alert.minSeats &&
        (alert.maxPricePerSeat === null || newRide.basePricePerSeat <= alert.maxPricePerSeat)
    );

    for (const alert of matchingAlerts) {
      pushNotification({
        userId: alert.userId,
        type: 'ride_available',
        title: `New ride: ${origin} to ${destination}`,
        message: `${user.name} posted ${totalSeats} seats at ₹${basePricePerSeat}/seat departing ${departureDate} at ${departureTime}.`,
        rideId: newRide.id,
      });
    }

    saveDb();
    const publicRide = toPublicRide(newRide);
    broadcastToAll({ type: 'ride:created', ride: publicRide });
    res.status(201).json({ ride: publicRide, matchedAlertsCount: matchingAlerts.length });
  });

  app.post('/api/rides/:id/status', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const ride = db.rides.find((r) => r.id === req.params.id);
    if (!ride) {
      res.status(404).json({ error: 'Ride not found' });
      return;
    }
    if (ride.driverId !== user.id) {
      res.status(403).json({ error: 'Only the ride driver can change trip status.' });
      return;
    }

    const nextStatus = req.body?.status as Ride['status'];
    if (!['scheduled', 'in_progress', 'completed', 'cancelled'].includes(nextStatus)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    ride.status = nextStatus;
    const now = new Date().toISOString();

    if (nextStatus === 'in_progress' && ride.liveLocation) {
      ride.liveLocation = {
        ...ride.liveLocation,
        progressPct: Math.max(ride.liveLocation.progressPct, 12),
        speedKmh: 62,
        updatedAt: now,
      };
    } else if (nextStatus === 'completed') {
      const destCoords = getCityCoords(ride.destination);
      ride.liveLocation = {
        lat: destCoords.lat,
        lng: destCoords.lng,
        progressPct: 100,
        currentCity: ride.destination,
        speedKmh: 0,
        updatedAt: now,
      };
    }

    for (const booking of db.bookings) {
      if (booking.rideId === ride.id && booking.paymentStatus === 'paid') {
        booking.status = nextStatus === 'completed' ? 'completed' : nextStatus === 'in_progress' ? 'active_trip' : 'paid';
        broadcastToBooking(booking.id, (viewerId) => ({
          type: 'booking:updated',
          booking: toHydratedBooking(booking, viewerId),
        }));
      }
    }

    saveDb();
    const publicRide = toPublicRide(ride);
    broadcastToAll({ type: 'ride:updated', ride: publicRide });
    res.json({ ride: publicRide });
  });

  app.post('/api/rides/:id/location', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const ride = db.rides.find((r) => r.id === req.params.id);
    if (!ride) {
      res.status(404).json({ error: 'Ride not found' });
      return;
    }

    const isPaidRider = db.bookings.some(
      (b) => b.rideId === ride.id && b.riderId === user.id && b.paymentStatus === 'paid'
    );
    if (ride.driverId !== user.id && !isPaidRider) {
      res.status(403).json({ error: 'Only the driver or confirmed riders can broadcast ride location.' });
      return;
    }

    const progressPct = Math.min(100, Math.max(0, Number(req.body?.progressPct ?? ride.liveLocation?.progressPct ?? 0)));
    const lat = Number(req.body?.lat ?? ride.liveLocation?.lat ?? 19.75);
    const lng = Number(req.body?.lng ?? ride.liveLocation?.lng ?? 75.71);
    const speedKmh = Math.max(0, Math.round(Number(req.body?.speedKmh ?? 64)));
    const waypointIdx = Math.min(
      ride.waypoints.length - 1,
      Math.floor((progressPct / 100) * (ride.waypoints.length - 1))
    );
    const currentCity = String(req.body?.currentCity ?? ride.waypoints[waypointIdx] ?? ride.origin);

    const liveLocation: LiveLocation = {
      lat,
      lng,
      progressPct,
      currentCity,
      speedKmh,
      updatedAt: new Date().toISOString(),
    };

    ride.liveLocation = liveLocation;
    if (progressPct > 0 && progressPct < 100 && ride.status === 'scheduled') {
      ride.status = 'in_progress';
    }
    saveDb();

    broadcastToAll({ type: 'ride:location', rideId: ride.id, liveLocation });
    res.json({ liveLocation });
  });

  // --- Bookings & Price Negotiation ---
  app.get('/api/bookings', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const myBookings = db.bookings
      .filter((b) => {
        const ride = db.rides.find((r) => r.id === b.rideId);
        return b.riderId === user.id || ride?.driverId === user.id;
      })
      .map((b) => toHydratedBooking(b, user.id));

    res.json({ bookings: myBookings });
  });

  app.get('/api/bookings/:id', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    const ride = db.rides.find((r) => r.id === booking.rideId);
    if (booking.riderId !== user.id && ride?.driverId !== user.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const messages = db.messages.filter((m) => m.bookingId === booking.id);
    const sosIncidents = db.sosIncidents.filter((s) => s.bookingId === booking.id);
    const reviews = db.reviews.filter((r) => r.bookingId === booking.id);

    res.json({
      booking: toHydratedBooking(booking, user.id),
      messages,
      sosIncidents,
      reviews,
    });
  });

  app.post('/api/bookings', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const rideId = String(req.body?.rideId ?? '');
    const seatsBooked = Math.max(1, Math.round(Number(req.body?.seatsBooked ?? 1)));
    const offerPriceRaw = req.body?.offerPricePerSeat;
    const ride = db.rides.find((r) => r.id === rideId);

    if (!ride) {
      res.status(404).json({ error: 'Ride not found.' });
      return;
    }
    if (ride.driverId === user.id) {
      res.status(400).json({ error: 'You cannot book seats on your own ride.' });
      return;
    }
    if (ride.availableSeats < seatsBooked) {
      res.status(400).json({ error: `Only ${ride.availableSeats} seat(s) remain available on this ride.` });
      return;
    }

    const hasDiscountOffer =
      ride.negotiable && offerPriceRaw !== undefined && Number(offerPriceRaw) > 0 && Number(offerPriceRaw) !== ride.basePricePerSeat;
    const offerPrice = hasDiscountOffer ? Math.round(Number(offerPriceRaw)) : ride.basePricePerSeat;
    const now = new Date().toISOString();

    const booking: StoredBooking = {
      id: `bk_${crypto.randomUUID().slice(0, 8)}`,
      rideId: ride.id,
      riderId: user.id,
      seatsBooked,
      originalPricePerSeat: ride.basePricePerSeat,
      currentOfferPerSeat: offerPrice,
      agreedPricePerSeat: hasDiscountOffer ? null : ride.basePricePerSeat,
      offerProposedBy: hasDiscountOffer ? 'rider' : null,
      status: hasDiscountOffer ? 'negotiating' : 'price_agreed',
      paymentStatus: 'unpaid',
      driverReviewedRider: false,
      riderReviewedDriver: false,
      createdAt: now,
    };

    db.bookings.unshift(booking);

    const systemIntro: ChatMessage = {
      id: `msg_${crypto.randomUUID().slice(0, 8)}`,
      bookingId: booking.id,
      senderId: 'safety_desk',
      senderName: 'Suffer Buddy Safety Desk',
      senderRole: 'moderator',
      type: 'moderation_warning',
      text: `Price discussion & ride coordination chat started for ${seatsBooked} seat(s) (${ride.origin} → ${ride.destination}). This chat is observed by Suffer Buddy Safety Desk. Mobile numbers unlock automatically after payment + 1.5% platform fee.`,
      createdAt: now,
    };
    db.messages.push(systemIntro);

    if (hasDiscountOffer) {
      const offerMsg: ChatMessage = {
        id: `msg_${crypto.randomUUID().slice(0, 8)}`,
        bookingId: booking.id,
        senderId: user.id,
        senderName: user.name,
        senderRole: 'rider',
        type: 'price_offer',
        text: `${user.name} requested ${seatsBooked} seat(s) and proposed ₹${offerPrice}/seat (listed ₹${ride.basePricePerSeat}/seat).`,
        proposedPricePerSeat: offerPrice,
        createdAt: new Date(Date.now() + 10).toISOString(),
      };
      db.messages.push(offerMsg);

      pushNotification({
        userId: ride.driverId,
        type: 'price_offer',
        title: `New seat request & price offer (${ride.origin} → ${ride.destination})`,
        message: `${user.name} requested ${seatsBooked} seat(s) at ₹${offerPrice}/seat. Review and respond in chat.`,
        rideId: ride.id,
        bookingId: booking.id,
      });
    } else {
      const lockMsg: ChatMessage = {
        id: `msg_${crypto.randomUUID().slice(0, 8)}`,
        bookingId: booking.id,
        senderId: 'system',
        senderName: 'Suffer Buddy Checkout',
        senderRole: 'system',
        type: 'price_accepted',
        text: `Booked at listed fare ₹${ride.basePricePerSeat}/seat for ${seatsBooked} seat(s). Proceed to secure checkout (+1.5% platform fee) to unlock verified mobile numbers.`,
        proposedPricePerSeat: ride.basePricePerSeat,
        createdAt: new Date(Date.now() + 10).toISOString(),
      };
      db.messages.push(lockMsg);

      pushNotification({
        userId: ride.driverId,
        type: 'price_agreed',
        title: `New seat booking on ${ride.origin} → ${ride.destination}`,
        message: `${user.name} booked ${seatsBooked} seat(s) at ₹${ride.basePricePerSeat}/seat and is ready for checkout.`,
        rideId: ride.id,
        bookingId: booking.id,
      });
    }

    saveDb();
    res.status(201).json({ booking: toHydratedBooking(booking, user.id) });
  });

  app.post('/api/bookings/:id/offer', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    const ride = db.rides.find((r) => r.id === booking.rideId);
    if (!ride) {
      res.status(404).json({ error: 'Ride not found' });
      return;
    }

    const isRider = booking.riderId === user.id;
    const isDriver = ride.driverId === user.id;
    if (!isRider && !isDriver) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    if (booking.paymentStatus === 'paid') {
      res.status(400).json({ error: 'Price cannot be modified after payment.' });
      return;
    }

    const proposedPricePerSeat = Math.round(Number(req.body?.proposedPricePerSeat ?? 0));
    if (proposedPricePerSeat < 50 || proposedPricePerSeat > ride.basePricePerSeat * 2) {
      res.status(400).json({ error: 'Enter a valid offer price per seat.' });
      return;
    }

    const role = isDriver ? 'driver' : 'rider';
    booking.currentOfferPerSeat = proposedPricePerSeat;
    booking.agreedPricePerSeat = null;
    booking.offerProposedBy = role;
    booking.status = 'negotiating';

    const msg: ChatMessage = {
      id: `msg_${crypto.randomUUID().slice(0, 8)}`,
      bookingId: booking.id,
      senderId: user.id,
      senderName: user.name,
      senderRole: role,
      type: 'price_offer',
      text: `${user.name} (${role}) proposed a negotiated fare of ₹${proposedPricePerSeat}/seat for ${booking.seatsBooked} seat(s).`,
      proposedPricePerSeat,
      createdAt: new Date().toISOString(),
    };
    db.messages.push(msg);

    const recipientId = isDriver ? booking.riderId : ride.driverId;
    pushNotification({
      userId: recipientId,
      type: 'price_offer',
      title: `Counter-offer: ₹${proposedPricePerSeat}/seat`,
      message: `${user.name} proposed ₹${proposedPricePerSeat}/seat on ${ride.origin} → ${ride.destination}.`,
      rideId: ride.id,
      bookingId: booking.id,
    });

    saveDb();
    broadcastToBooking(booking.id, (viewerId) => ({
      type: 'booking:updated',
      booking: toHydratedBooking(booking, viewerId),
    }));
    broadcastToBooking(booking.id, () => ({ type: 'chat:message', message: msg }));
    res.json({ booking: toHydratedBooking(booking, user.id), message: msg });
  });

  app.post('/api/bookings/:id/accept-price', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    const ride = db.rides.find((r) => r.id === booking.rideId);
    if (!ride) {
      res.status(404).json({ error: 'Ride not found' });
      return;
    }

    const isRider = booking.riderId === user.id;
    const isDriver = ride.driverId === user.id;
    if (!isRider && !isDriver) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const role = isDriver ? 'driver' : 'rider';
    if (booking.offerProposedBy === role) {
      res.status(400).json({ error: 'Waiting for the other party to accept your latest price offer, or send a new offer.' });
      return;
    }

    booking.agreedPricePerSeat = booking.currentOfferPerSeat;
    booking.status = 'price_agreed';

    const { rideSubtotal, platformFee, totalPayable } = computeFees(booking.agreedPricePerSeat, booking.seatsBooked);
    const msg: ChatMessage = {
      id: `msg_${crypto.randomUUID().slice(0, 8)}`,
      bookingId: booking.id,
      senderId: 'system',
      senderName: 'Suffer Buddy Checkout',
      senderRole: 'system',
      type: 'price_accepted',
      text: `${user.name} accepted ₹${booking.agreedPricePerSeat}/seat! Ride fare: ₹${rideSubtotal} + 1.5% platform fee (₹${platformFee}) = ₹${totalPayable}. Rider may now pay securely to unlock contacts.`,
      proposedPricePerSeat: booking.agreedPricePerSeat,
      createdAt: new Date().toISOString(),
    };
    db.messages.push(msg);

    const recipientId = isDriver ? booking.riderId : ride.driverId;
    pushNotification({
      userId: recipientId,
      type: 'price_agreed',
      title: `Final fare agreed: ₹${booking.agreedPricePerSeat}/seat`,
      message: `Complete secure checkout (₹${totalPayable} incl. 1.5% fee) to confirm seats and unlock contact numbers.`,
      rideId: ride.id,
      bookingId: booking.id,
    });

    saveDb();
    broadcastToBooking(booking.id, (viewerId) => ({
      type: 'booking:updated',
      booking: toHydratedBooking(booking, viewerId),
    }));
    broadcastToBooking(booking.id, () => ({ type: 'chat:message', message: msg }));
    res.json({ booking: toHydratedBooking(booking, user.id) });
  });

  app.post('/api/bookings/:id/route', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    const ride = db.rides.find((r) => r.id === booking.rideId);
    if (!ride) {
      res.status(404).json({ error: 'Ride not found' });
      return;
    }
    const isRider = booking.riderId === user.id;
    const isDriver = ride.driverId === user.id;
    if (!isRider && !isDriver) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    if (booking.paymentStatus === 'paid') {
      res.status(400).json({ error: 'Route is already finalized after payment.' });
      return;
    }

    const pickupPoint = String(req.body?.pickupPoint ?? ride.pickupPoint).trim();
    const dropPoint = String(req.body?.dropPoint ?? ride.dropPoint).trim();
    const rawStops = Array.isArray(req.body?.waypoints)
      ? req.body.waypoints.map((s: unknown) => String(s).trim()).filter(Boolean)
      : ride.waypoints;
    const waypoints = rawStops.length >= 2 ? rawStops : ride.waypoints;

    const safetyCheck = inspectChatMessageForSafety(`${pickupPoint} ${dropPoint} ${waypoints.join(' ')}`, 'unpaid');
    if (!safetyCheck.allowed) {
      res.status(422).json({ error: safetyCheck.flaggedReason });
      return;
    }

    const role = isDriver ? 'driver' : 'rider';
    booking.routeProposal = {
      pickupPoint,
      dropPoint,
      waypoints,
      proposedBy: role,
      agreed: false,
    };

    const msg: ChatMessage = {
      id: `msg_${crypto.randomUUID().slice(0, 8)}`,
      bookingId: booking.id,
      senderId: user.id,
      senderName: user.name,
      senderRole: role,
      type: 'route_offer',
      text: `${user.name} (${isDriver ? 'Buddy' : 'Rider'}) proposed route: ${waypoints.join(' → ')} · Pickup: ${pickupPoint} · Drop: ${dropPoint}.`,
      createdAt: new Date().toISOString(),
    };
    db.messages.push(msg);

    const recipientId = isDriver ? booking.riderId : ride.driverId;
    pushNotification({
      userId: recipientId,
      type: 'chat_message',
      title: `Route adjustment proposed (${ride.origin} → ${ride.destination})`,
      message: `${user.name} proposed Pickup: ${pickupPoint} · Drop: ${dropPoint}.`,
      rideId: ride.id,
      bookingId: booking.id,
    });

    saveDb();
    broadcastToBooking(booking.id, (viewerId) => ({
      type: 'booking:updated',
      booking: toHydratedBooking(booking, viewerId),
    }));
    broadcastToBooking(booking.id, () => ({ type: 'chat:message', message: msg }));
    res.json({ booking: toHydratedBooking(booking, user.id), message: msg });
  });

  app.post('/api/bookings/:id/accept-route', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    const ride = db.rides.find((r) => r.id === booking.rideId);
    if (!ride) {
      res.status(404).json({ error: 'Ride not found' });
      return;
    }
    const isRider = booking.riderId === user.id;
    const isDriver = ride.driverId === user.id;
    if (!isRider && !isDriver) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    if (!booking.routeProposal) {
      res.status(400).json({ error: 'No pending route proposal.' });
      return;
    }

    const role = isDriver ? 'driver' : 'rider';
    if (booking.routeProposal.proposedBy === role && !booking.routeProposal.agreed) {
      res.status(400).json({ error: 'Waiting for the other party to accept your proposed route.' });
      return;
    }

    booking.routeProposal.agreed = true;
    const msg: ChatMessage = {
      id: `msg_${crypto.randomUUID().slice(0, 8)}`,
      bookingId: booking.id,
      senderId: 'system',
      senderName: 'Suffer Buddy Route Lock',
      senderRole: 'system',
      type: 'route_accepted',
      text: `${user.name} confirmed the route: ${booking.routeProposal.waypoints.join(' → ')} · Pickup: ${booking.routeProposal.pickupPoint} · Drop: ${booking.routeProposal.dropPoint}.`,
      createdAt: new Date().toISOString(),
    };
    db.messages.push(msg);

    saveDb();
    broadcastToBooking(booking.id, (viewerId) => ({
      type: 'booking:updated',
      booking: toHydratedBooking(booking, viewerId),
    }));
    broadcastToBooking(booking.id, () => ({ type: 'chat:message', message: msg }));
    res.json({ booking: toHydratedBooking(booking, user.id) });
  });

  app.post('/api/bookings/:id/messages', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    const ride = db.rides.find((r) => r.id === booking.rideId);
    if (!ride) {
      res.status(404).json({ error: 'Ride not found' });
      return;
    }

    const isRider = booking.riderId === user.id;
    const isDriver = ride.driverId === user.id;
    if (!isRider && !isDriver) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const rawText = String(req.body?.text ?? '');
    const inspection = inspectChatMessageForSafety(rawText, booking.paymentStatus);

    if (!inspection.allowed) {
      const warningMsg: ChatMessage = {
        id: `msg_${crypto.randomUUID().slice(0, 8)}`,
        bookingId: booking.id,
        senderId: 'safety_desk',
        senderName: 'Suffer Buddy Safety Desk (Observed)',
        senderRole: 'moderator',
        type: 'moderation_warning',
        text: inspection.flaggedReason ?? 'Message blocked by safety policy.',
        flaggedReason: inspection.flaggedReason,
        createdAt: new Date().toISOString(),
      };
      db.messages.push(warningMsg);
      saveDb();
      broadcastToBooking(booking.id, () => ({ type: 'chat:message', message: warningMsg }));
      res.status(422).json({
        error: inspection.flaggedReason,
        moderationMessage: warningMsg,
      });
      return;
    }

    const role = isDriver ? 'driver' : 'rider';
    const msg: ChatMessage = {
      id: `msg_${crypto.randomUUID().slice(0, 8)}`,
      bookingId: booking.id,
      senderId: user.id,
      senderName: user.name,
      senderRole: role,
      type: 'text',
      text: inspection.sanitizedText,
      createdAt: new Date().toISOString(),
    };
    db.messages.push(msg);

    const recipientId = isDriver ? booking.riderId : ride.driverId;
    pushNotification({
      userId: recipientId,
      type: 'chat_message',
      title: `Message from ${user.name}`,
      message: inspection.sanitizedText.slice(0, 90),
      rideId: ride.id,
      bookingId: booking.id,
    });

    saveDb();
    broadcastToBooking(booking.id, () => ({ type: 'chat:message', message: msg }));
    res.status(201).json({ message: msg });
  });

  // --- Secure Payment + 1.5% Fee + Contact Number Unlock ---
  app.post('/api/bookings/:id/pay', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    if (booking.riderId !== user.id) {
      res.status(403).json({ error: 'Only the rider can complete payment for this booking.' });
      return;
    }
    if (booking.paymentStatus === 'paid') {
      res.json({ booking: toHydratedBooking(booking, user.id) });
      return;
    }

    const ride = db.rides.find((r) => r.id === booking.rideId);
    if (!ride) {
      res.status(404).json({ error: 'Ride not found' });
      return;
    }
    if (ride.availableSeats < booking.seatsBooked) {
      res.status(409).json({ error: 'Not enough seats remain on this ride.' });
      return;
    }

    // If rider pays immediately without waiting for discount approval, lock listed base price;
    // otherwise must have price_agreed.
    if (booking.status === 'negotiating') {
      if (booking.agreedPricePerSeat === null) {
        if (booking.currentOfferPerSeat < ride.basePricePerSeat && booking.offerProposedBy === 'rider') {
          res.status(400).json({
            error: 'Waiting for driver to accept your discounted offer before payment, or ask driver to accept in chat.',
          });
          return;
        }
        booking.agreedPricePerSeat = booking.currentOfferPerSeat;
      }
    }

    const finalPrice = booking.agreedPricePerSeat ?? ride.basePricePerSeat;
    booking.agreedPricePerSeat = finalPrice;
    const { rideSubtotal, platformFee, totalPayable } = computeFees(finalPrice, booking.seatsBooked);

    ride.availableSeats -= booking.seatsBooked;
    booking.paymentStatus = 'paid';
    booking.status = ride.status === 'in_progress' ? 'active_trip' : 'paid';
    booking.paymentRef = `SP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    booking.paidAt = new Date().toISOString();

    const confirmMsg: ChatMessage = {
      id: `msg_${crypto.randomUUID().slice(0, 8)}`,
      bookingId: booking.id,
      senderId: 'system',
      senderName: 'Suffer Buddy Payments',
      senderRole: 'system',
      type: 'payment_confirmed',
      text: `Payment confirmed (Ref: ${booking.paymentRef}). Ride fare ₹${rideSubtotal} + 1.5% platform fee ₹${platformFee} = ₹${totalPayable} paid. Verified mobile contact numbers and full vehicle plate are now unlocked for both parties.`,
      createdAt: new Date().toISOString(),
    };
    db.messages.push(confirmMsg);

    pushNotification({
      userId: ride.driverId,
      type: 'payment_done',
      title: `Payment received for ${booking.seatsBooked} seat(s)`,
      message: `${user.name} paid ₹${totalPayable} (incl. 1.5% platform fee). Contact number is now unlocked.`,
      rideId: ride.id,
      bookingId: booking.id,
    });
    pushNotification({
      userId: booking.riderId,
      type: 'payment_done',
      title: `Seats confirmed (${ride.origin} → ${ride.destination})`,
      message: `Paid ₹${totalPayable} (Ref ${booking.paymentRef}). Driver contact number is now visible.`,
      rideId: ride.id,
      bookingId: booking.id,
    });

    saveDb();
    const publicRide = toPublicRide(ride);
    broadcastToAll({ type: 'ride:updated', ride: publicRide });
    broadcastToBooking(booking.id, (viewerId) => ({
      type: 'booking:updated',
      booking: toHydratedBooking(booking, viewerId),
    }));
    broadcastToBooking(booking.id, () => ({ type: 'chat:message', message: confirmMsg }));

    res.json({ booking: toHydratedBooking(booking, user.id) });
  });

  // --- SOS Emergency Button ---
  app.post('/api/bookings/:id/sos', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    const ride = db.rides.find((r) => r.id === booking.rideId);
    if (!ride) {
      res.status(404).json({ error: 'Ride not found' });
      return;
    }
    if (booking.riderId !== user.id && ride.driverId !== user.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const lat = Number(req.body?.lat ?? ride.liveLocation?.lat ?? 19.8762);
    const lng = Number(req.body?.lng ?? ride.liveLocation?.lng ?? 75.3433);
    const locationLabel = String(
      req.body?.locationLabel ?? ride.liveLocation?.currentCity ?? `${ride.origin} – ${ride.destination} Highway`
    );

    const incident: SosIncident = {
      id: `sos_${crypto.randomUUID().slice(0, 8)}`,
      bookingId: booking.id,
      rideId: ride.id,
      triggeredByUserId: user.id,
      triggeredByName: user.name,
      lat,
      lng,
      locationLabel,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    db.sosIncidents.unshift(incident);

    const sosMsg: ChatMessage = {
      id: `msg_${crypto.randomUUID().slice(0, 8)}`,
      bookingId: booking.id,
      senderId: 'safety_desk',
      senderName: 'Suffer Buddy Emergency SOS',
      senderRole: 'moderator',
      type: 'sos_alert',
      text: `SOS ALERT triggered by ${user.name} near ${locationLabel} (${lat.toFixed(4)}, ${lng.toFixed(4)}). Live coordinates & vehicle ${ride.vehicleNumberFull} shared with Emergency Contact (${user.emergencyContactName || '112'}) and Suffer Buddy Safety Desk.`,
      createdAt: incident.createdAt,
    };
    db.messages.push(sosMsg);

    const otherUserId = user.id === ride.driverId ? booking.riderId : ride.driverId;
    pushNotification({
      userId: otherUserId,
      type: 'sos_alert',
      title: `URGENT SOS Alert on ${ride.origin} → ${ride.destination}`,
      message: `${user.name} triggered an SOS emergency alert near ${locationLabel}.`,
      rideId: ride.id,
      bookingId: booking.id,
    });

    saveDb();
    broadcastToBooking(booking.id, () => ({ type: 'sos:alert', incident }));
    broadcastToBooking(booking.id, () => ({ type: 'chat:message', message: sosMsg }));
    res.status(201).json({ incident });
  });

  app.post('/api/sos/:id/resolve', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const incident = db.sosIncidents.find((s) => s.id === req.params.id);
    if (!incident) {
      res.status(404).json({ error: 'Incident not found' });
      return;
    }
    incident.status = 'resolved';
    saveDb();
    broadcastToBooking(incident.bookingId, () => ({ type: 'sos:resolved', incident }));
    res.json({ incident });
  });

  // --- Mutual Reviews (Drivers & Riders) ---
  app.get('/api/reviews', (req, res) => {
    const userId = String(req.query.userId ?? '').trim();
    const list = userId ? db.reviews.filter((r) => r.toUserId === userId) : db.reviews.slice(0, 30);
    res.json({ reviews: list });
  });

  app.post('/api/bookings/:id/review', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    const ride = db.rides.find((r) => r.id === booking.rideId);
    if (!ride) {
      res.status(404).json({ error: 'Ride not found' });
      return;
    }
    if (booking.paymentStatus !== 'paid') {
      res.status(400).json({ error: 'Reviews can only be submitted for paid bookings.' });
      return;
    }

    const isRider = booking.riderId === user.id;
    const isDriver = ride.driverId === user.id;
    if (!isRider && !isDriver) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (isRider && booking.riderReviewedDriver) {
      res.status(400).json({ error: 'You have already reviewed the driver for this trip.' });
      return;
    }
    if (isDriver && booking.driverReviewedRider) {
      res.status(400).json({ error: 'You have already reviewed the rider for this trip.' });
      return;
    }

    const rating = Math.min(5, Math.max(1, Math.round(Number(req.body?.rating ?? 5))));
    const tags = Array.isArray(req.body?.tags) ? req.body.tags.slice(0, 4).map(String) : [];
    const comment = String(req.body?.comment ?? '').trim().slice(0, 400);

    const toUserId = isRider ? ride.driverId : booking.riderId;
    const toRole: 'driver' | 'rider' = isRider ? 'driver' : 'rider';

    const review: Review = {
      id: `rev_${crypto.randomUUID().slice(0, 8)}`,
      bookingId: booking.id,
      rideId: ride.id,
      fromUserId: user.id,
      fromUserName: user.name,
      toUserId,
      toRole,
      rating,
      tags,
      comment,
      createdAt: new Date().toISOString(),
    };
    db.reviews.unshift(review);

    if (isRider) booking.riderReviewedDriver = true;
    if (isDriver) booking.driverReviewedRider = true;

    const targetUser = db.users.find((u) => u.id === toUserId);
    if (targetUser) {
      const relevant = db.reviews.filter((r) => r.toUserId === toUserId && r.toRole === toRole);
      const avg = relevant.reduce((sum, r) => sum + r.rating, 0) / Math.max(1, relevant.length);
      if (toRole === 'driver') {
        targetUser.driverRating = Math.round(avg * 10) / 10;
        targetUser.driverReviewCount = relevant.length;
      } else {
        targetUser.riderRating = Math.round(avg * 10) / 10;
        targetUser.riderReviewCount = relevant.length;
      }
    }

    pushNotification({
      userId: toUserId,
      type: 'review_received',
      title: `New ${rating}★ ${toRole} review`,
      message: `${user.name} left a ${rating}-star review${comment ? `: "${comment.slice(0, 60)}"` : '.'}`,
      rideId: ride.id,
      bookingId: booking.id,
    });

    saveDb();
    broadcastToBooking(booking.id, (viewerId) => ({
      type: 'booking:updated',
      booking: toHydratedBooking(booking, viewerId),
    }));
    res.status(201).json({ review });
  });

  // --- Automated Route Alerts & Notifications ---
  app.get('/api/alerts', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    res.json({ alerts: db.alerts.filter((a) => a.userId === user.id) });
  });

  app.post('/api/alerts', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const origin = String(req.body?.origin ?? '').trim();
    const destination = String(req.body?.destination ?? '').trim();
    const minSeats = Math.max(1, Math.round(Number(req.body?.minSeats ?? 1)));
    const maxPricePerSeat = req.body?.maxPricePerSeat ? Math.round(Number(req.body.maxPricePerSeat)) : null;

    if (!origin || !destination) {
      res.status(400).json({ error: 'Origin and destination are required for route alerts.' });
      return;
    }

    const alert: RouteAlert = {
      id: `alt_${crypto.randomUUID().slice(0, 8)}`,
      userId: user.id,
      origin,
      destination,
      minSeats,
      maxPricePerSeat,
      active: true,
      createdAt: new Date().toISOString(),
    };
    db.alerts.unshift(alert);
    saveDb();
    res.status(201).json({ alert });
  });

  app.delete('/api/alerts/:id', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    db.alerts = db.alerts.filter((a) => !(a.id === req.params.id && a.userId === user.id));
    saveDb();
    res.json({ success: true });
  });

  app.get('/api/notifications', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    res.json({ notifications: db.notifications.filter((n) => n.userId === user.id) });
  });

  app.post('/api/notifications/read-all', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    for (const n of db.notifications) {
      if (n.userId === user.id) n.read = true;
    }
    saveDb();
    res.json({ success: true });
  });

  // Vite or Static Frontend Serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const client: WsClient = {
      ws,
      userId: null,
      bookingRooms: new Set(),
      rideRooms: new Set(),
    };
    wsClients.add(client);

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(String(raw)) as { type?: string; token?: string; bookingId?: string; rideId?: string };
        if (data.type === 'auth' && data.token) {
          const session = db.sessions.find((s) => s.token === data.token);
          client.userId = session?.userId ?? null;
          sendWs(ws, { type: 'auth:ok', userId: client.userId });
        } else if (data.type === 'booking:join' && data.bookingId) {
          client.bookingRooms.add(data.bookingId);
        } else if (data.type === 'ride:join' && data.rideId) {
          client.rideRooms.add(data.rideId);
        }
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      wsClients.delete(client);
    });
  });

  const PORT = Number(process.env.PORT ?? 3000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Suffer Buddy server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
